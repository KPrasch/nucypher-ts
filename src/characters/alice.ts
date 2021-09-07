import { Provider } from '@ethersproject/providers';
import { PublicKey, Signer, VerifiedKeyFrag } from 'umbral-pre';

import { StakingEscrowAgent } from '../agents/staking-escrow';
import { encryptAndSign } from '../crypto/api';
import { NucypherKeyring } from '../crypto/keyring';
import { DelegatingPower, SigningPower, TransactingPower } from '../crypto/powers';
import { PolicyMessageKit } from '../kits/message';
import { BlockchainPolicy, BlockchainPolicyParameters, EnactedPolicy } from '../policies/policy';
import { ChecksumAddress, Configuration } from '../types';
import { calculatePeriodDuration, dateAtPeriod, mergeWithoutUndefined } from '../utils';

import { Bob } from './bob';
import { Porter } from './porter';

export class Alice {
  public readonly porter: Porter;
  // TODO:  Should powers be visible or should they be used indirectly?
  // TODO: This is the only visible transacting power
  public readonly transactingPower: TransactingPower;
  private config: Configuration;
  private delegatingPower: DelegatingPower;
  private signingPower: SigningPower;

  constructor(
    config: Configuration,
    signingPower: SigningPower,
    delegatingPower: DelegatingPower,
    transactingPower: TransactingPower
  ) {
    this.config = config;
    this.porter = new Porter(config.porterUri);
    this.signingPower = signingPower;
    this.delegatingPower = delegatingPower;
    this.transactingPower = transactingPower;
  }

  public get verifyingKey(): PublicKey {
    return this.signingPower.publicKey;
  }

  public get signer(): Signer {
    return this.signingPower.signer;
  }

  public static fromKeyring(config: Configuration, keyring: NucypherKeyring): Alice {
    const signingPower = keyring.deriveSigningPower();
    const delegatingPower = keyring.deriveDelegatingPower();
    const transactingPower = keyring.deriveTransactingPower();
    return new Alice(config, signingPower, delegatingPower, transactingPower);
  }

  public connect(provider: Provider) {
    this.transactingPower.connect(provider);
  }

  public async getPolicyEncryptingKeyFromLabel(label: string): Promise<PublicKey> {
    return this.delegatingPower.getPublicKeyFromLabel(label);
  }

  public async grant(
    policyParameters: BlockchainPolicyParameters, // TODO: Should this object be used in user-facing API?
    excludeUrsulas?: ChecksumAddress[],
    includeUrsulas?: ChecksumAddress[]
  ): Promise<EnactedPolicy> {
    const ursulas = await this.porter.getUrsulas(
      policyParameters.n,
      policyParameters.paymentPeriods,
      excludeUrsulas,
      includeUrsulas
    );
    const policy = await this.createPolicy(policyParameters);
    console.log({ ursulas });
    const enactedPolicy = await policy.enact(ursulas);
    await this.porter.publishTreasureMap(
      enactedPolicy.treasureMap,
      policyParameters.bob.encryptingPublicKey
    );
    return enactedPolicy;
  }

  public encryptFor(recipientPublicKey: PublicKey, payload: Uint8Array): PolicyMessageKit {
    const messageKit = encryptAndSign(recipientPublicKey, payload, this.signer);
    return PolicyMessageKit.fromMessageKit(messageKit, this.signer.verifyingKey());
  }

  public async generateKFrags(
    bob: Bob,
    label: string,
    m: number,
    n: number
  ): Promise<{ delegatingPublicKey: PublicKey; verifiedKFrags: VerifiedKeyFrag[] }> {
    return this.delegatingPower.generateKFrags(bob.encryptingPublicKey, this.signer, label, m, n);
  }

  private async createPolicy(
    policyParameters: BlockchainPolicyParameters
  ): Promise<BlockchainPolicy> {
    const { label, m, n, bob } = policyParameters;
    const { delegatingPublicKey, verifiedKFrags } = await this.generateKFrags(
      policyParameters.bob,
      label,
      m,
      n
    );
    const { expiration, value } = await this.generatePolicyParameters(policyParameters);
    return new BlockchainPolicy(
      this,
      label,
      expiration!,
      bob,
      verifiedKFrags,
      delegatingPublicKey,
      m,
      n,
      value!
    );
  }

  private async generatePolicyParameters(
    policyParams: BlockchainPolicyParameters
  ): Promise<BlockchainPolicyParameters> {
    const { n, paymentPeriods, expiration, value, rate } = policyParams;
    if (!paymentPeriods && !expiration) {
      throw new Error(
        "Policy end time must be specified as 'expiration' or 'paymentPeriods', got neither"
      );
    }

    if (expiration && expiration < new Date(Date.now())) {
      throw new Error(`Expiration must be in the future: ${expiration}).`);
    }

    const blockNumber = await this.transactingPower.wallet.provider.getBlockNumber();
    const block = await this.transactingPower.wallet.provider.getBlock(blockNumber);
    const blockTime = new Date(block.timestamp * 1000);
    if (expiration && expiration < blockTime) {
      throw new Error(
        `Expiration must be in the future (${expiration} is earlier than block time ${blockTime}).`
      );
    }

    const secondsPerPeriod = await StakingEscrowAgent.getSecondsPerPeriod(
      this.transactingPower.wallet.provider
    );
    if (paymentPeriods) {
      const currentPeriod = await StakingEscrowAgent.getCurrentPeriod(
        this.transactingPower.wallet.provider
      );
      const newExpiration = dateAtPeriod(currentPeriod + paymentPeriods, secondsPerPeriod, true);
      //  Get the last second of the target period
      policyParams.expiration = new Date(newExpiration.getTime() - 1000);
    } else {
      // +1 will equal to number of all included periods
      policyParams.paymentPeriods = calculatePeriodDuration(expiration!, secondsPerPeriod) + 1;
    }

    const blockchainParams = BlockchainPolicy.generatePolicyParameters(
      n,
      paymentPeriods!,
      value,
      rate
    );

    // These values may have been recalculated in this block time.
    const policyEndTime = { paymentPeriods, expiration };
    // TODO: Can we do that more elegantly?
    return mergeWithoutUndefined(
      mergeWithoutUndefined(policyParams, blockchainParams),
      policyEndTime
    ) as BlockchainPolicyParameters;
  }
}