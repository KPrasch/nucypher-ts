import { SemVer } from 'semver';

import { ConditionExpression } from '../../../src/conditions';
import {
  CompoundCondition,
  ContractCondition,
  ContractConditionProps,
  RpcCondition,
  TimeCondition,
  TimeConditionProps,
} from '../../../src/conditions/base';
import { RpcConditionType } from '../../../src/conditions/base/rpc';
import { USER_ADDRESS_PARAM } from '../../../src/conditions/const';
import { ERC721Balance } from '../../../src/conditions/predefined';
import { objectEquals, toJSON } from '../../../src/utils';
import {
  TEST_CHAIN_ID,
  TEST_CONTRACT_ADDR,
  testFunctionAbi,
  testReturnValueTest,
} from '../testVariables';
import {
  testContractConditionObj,
  testRpcConditionObj,
  testTimeConditionObj,
} from '../testVariables';

describe('condition set', () => {
  const erc721BalanceCondition = new ERC721Balance({
    chain: TEST_CHAIN_ID,
    contractAddress: TEST_CONTRACT_ADDR,
  });

  const contractConditionNoAbi = new ContractCondition(
    testContractConditionObj
  );

  const customParamKey = ':customParam';
  const contractConditionWithAbiObj: ContractConditionProps = {
    ...testContractConditionObj,
    standardContractType: undefined,
    functionAbi: testFunctionAbi,
    method: testFunctionAbi.name,
    parameters: [USER_ADDRESS_PARAM, customParamKey],
    returnValueTest: {
      ...testReturnValueTest,
    },
  };
  const contractConditionWithAbi = new ContractCondition(
    contractConditionWithAbiObj
  );

  const rpcCondition = new RpcCondition(testRpcConditionObj);
  const timeCondition = new TimeCondition(testTimeConditionObj);
  const compoundCondition = new CompoundCondition({
    operator: 'and',
    operands: [
      testContractConditionObj,
      testTimeConditionObj,
      testRpcConditionObj,
      {
        operator: 'or',
        operands: [testTimeConditionObj, testContractConditionObj],
      },
    ],
  });

  describe('equality', () => {
    const conditionExprCurrentVersion = new ConditionExpression(rpcCondition);

    it('same version and condition', () => {
      const conditionExprSameCurrentVersion = new ConditionExpression(
        rpcCondition,
        ConditionExpression.VERSION
      );
      expect(
        conditionExprCurrentVersion.equals(conditionExprSameCurrentVersion)
      ).toBeTruthy();
    });

    it('different minor/patch version but same condition', () => {
      const conditionExprOlderMinorVersion = new ConditionExpression(
        rpcCondition,
        '0.1.0'
      );
      const conditionExprOlderPatchVersion = new ConditionExpression(
        rpcCondition,
        '0.0.1'
      );
      expect(
        conditionExprCurrentVersion.equals(conditionExprOlderMinorVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprCurrentVersion.equals(conditionExprOlderPatchVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprOlderMinorVersion.equals(conditionExprOlderPatchVersion)
      ).not.toBeTruthy();
    });

    it('minor/patch number greater than major; still older', () => {
      const conditionExprOlderMinorVersion = new ConditionExpression(
        rpcCondition,
        '0.9.0'
      );
      const conditionExprOlderPatchVersion = new ConditionExpression(
        rpcCondition,
        '0.0.9'
      );
      const conditionExprOlderMinorPatchVersion = new ConditionExpression(
        rpcCondition,
        '0.9.9'
      );
      expect(
        conditionExprCurrentVersion.equals(conditionExprOlderMinorVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprCurrentVersion.equals(conditionExprOlderPatchVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprCurrentVersion.equals(conditionExprOlderMinorPatchVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprOlderMinorVersion.equals(conditionExprOlderPatchVersion)
      ).not.toBeTruthy();
      expect(
        conditionExprOlderMinorVersion.equals(
          conditionExprOlderMinorPatchVersion
        )
      ).not.toBeTruthy();
      expect(
        conditionExprOlderPatchVersion.equals(
          conditionExprOlderMinorPatchVersion
        )
      ).not.toBeTruthy();
    });

    it.each([
      erc721BalanceCondition,
      contractConditionNoAbi,
      contractConditionWithAbi,
      timeCondition,
      compoundCondition,
    ])('same version but different condition', (condition) => {
      const conditionExprSameVersionDifferentCondition =
        new ConditionExpression(condition);
      expect(
        conditionExprCurrentVersion.equals(
          conditionExprSameVersionDifferentCondition
        )
      ).not.toBeTruthy();
    });

    it('same contract condition although using erc721 helper', () => {
      const erc721ConditionExpr = new ConditionExpression(
        erc721BalanceCondition
      );
      const erc721ConditionData = erc721BalanceCondition.toObj();
      const sameContractCondition = new ContractCondition(erc721ConditionData);
      const contractConditionExpr = new ConditionExpression(
        sameContractCondition
      );
      expect(
        objectEquals(erc721ConditionExpr.toObj(), contractConditionExpr.toObj())
      ).toBeTruthy();
    });
  });

  describe('serialization / deserialization', () => {
    it.each([
      erc721BalanceCondition,
      contractConditionNoAbi,
      contractConditionWithAbi,
      rpcCondition,
      timeCondition,
      compoundCondition,
    ])('serializes to and from json', (condition) => {
      const conditionExpr = new ConditionExpression(condition);
      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('version');
      expect(conditionExprJson).toContain(ConditionExpression.VERSION);
      expect(conditionExprJson).toContain('condition');
      expect(conditionExprJson).toContain(toJSON(condition.toObj()));

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.equals(conditionExprFromJson)).toBeTruthy();
    });

    it('serializes to and from WASM conditions', () => {
      const conditionExpr = new ConditionExpression(erc721BalanceCondition);
      const wasmConditions = conditionExpr.toWASMConditions();
      const fromWasm = ConditionExpression.fromWASMConditions(wasmConditions);
      expect(conditionExpr.equals(fromWasm)).toBeTruthy();
    });

    it('incompatible version', () => {
      const currentVersion = new SemVer(ConditionExpression.VERSION);
      const invalidVersion = currentVersion.inc('major');
      expect(() => {
        ConditionExpression.fromObj({
          version: invalidVersion.version,
          condition: testTimeConditionObj,
        });
      }).toThrow(
        `Version provided, ${invalidVersion}, is incompatible with current version, ${ConditionExpression.VERSION}`
      );
    });

    it.each(['version', 'x.y', 'x.y.z', '-1,0.0', '1.0.0.0.0.0.0'])(
      'invalid versions',
      (invalidVersion) => {
        expect(() => {
          ConditionExpression.fromObj({
            version: invalidVersion,
            condition: testTimeConditionObj,
          });
        }).toThrow(`Invalid Version: ${invalidVersion}`);
      }
    );

    it.each([
      // no "operator" nor "method" value
      {
        version: ConditionExpression.VERSION,
        condition: {
          randoKey: 'randoValue',
          otherKey: 'otherValue',
        },
      },
      // invalid "method" and no "contractAddress"
      {
        version: ConditionExpression.VERSION,
        condition: {
          method: 'doWhatIWant',
          returnValueTest: {
            index: 0,
            comparator: '>',
            value: '100',
          },
          chain: 5,
        },
      },
      // condition with wrong method "method" and no contract address
      {
        version: ConditionExpression.VERSION,
        condition: {
          ...testTimeConditionObj,
          method: 'doWhatIWant',
        },
      },
      // rpc condition (no contract address) with disallowed method
      {
        version: ConditionExpression.VERSION,
        condition: {
          ...testRpcConditionObj,
          method: 'isPolicyActive',
        },
      },
    ])("can't determine condition type", (invalidCondition) => {
      expect(() => {
        ConditionExpression.fromObj(invalidCondition);
      }).toThrow('unrecognized condition data');
    });

    it.each(['_invalid_condition_type_', undefined as unknown as string])(
      'rejects an invalid condition type',
      (invalidConditionType) => {
        const conditionObj = {
          ...testTimeConditionObj,
          conditionType: invalidConditionType,
        } as unknown as TimeConditionProps;
        expect(() => {
          ConditionExpression.fromObj({
            version: ConditionExpression.VERSION,
            condition: conditionObj,
          });
        }).toThrow(`Invalid conditionType: ${invalidConditionType}`);
      }
    );

    it('rejects a mismatched condition type', () => {
      const conditionObj = {
        ...testTimeConditionObj,
        conditionType: RpcConditionType,
      } as unknown as TimeConditionProps;
      expect(() => {
        ConditionExpression.fromObj({
          version: ConditionExpression.VERSION,
          condition: conditionObj,
        });
      }).toThrow(/^Invalid condition/);
    });

    it('erc721 condition serialization', () => {
      const conditionExpr = new ConditionExpression(erc721BalanceCondition);

      const erc721BalanceConditionObj = erc721BalanceCondition.toObj();
      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('contractAddress');
      expect(conditionExprJson).toContain(
        erc721BalanceConditionObj.contractAddress
      );
      expect(conditionExprJson).toContain('standardContractType');
      expect(conditionExprJson).toContain('ERC721');
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(erc721BalanceConditionObj.method);
      expect(conditionExprJson).toContain('returnValueTest');

      expect(conditionExprJson).not.toContain('functionAbi');
      expect(conditionExprJson).not.toContain('operator');
      expect(conditionExprJson).not.toContain('operands');

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(ContractCondition);
    });

    it('contract condition no abi serialization', () => {
      const conditionExpr = new ConditionExpression(contractConditionNoAbi);

      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('contractAddress');
      expect(conditionExprJson).toContain(
        testContractConditionObj.contractAddress
      );
      expect(conditionExprJson).toContain('standardContractType');
      expect(conditionExprJson).toContain(
        testContractConditionObj.standardContractType
      );
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(testContractConditionObj.method);
      expect(conditionExprJson).toContain('parameters');
      expect(conditionExprJson).toContain(
        testContractConditionObj.parameters[0]
      );
      expect(conditionExprJson).toContain('returnValueTest');
      expect(conditionExprJson).not.toContain('functionAbi');
      expect(conditionExprJson).not.toContain('operator');
      expect(conditionExprJson).not.toContain('operands');

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(ContractCondition);
    });

    it('contract condition with abi serialization', () => {
      const conditionExpr = new ConditionExpression(contractConditionWithAbi);

      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('contractAddress');
      expect(conditionExprJson).toContain(
        contractConditionWithAbiObj.contractAddress
      );
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(contractConditionWithAbiObj.method);
      expect(conditionExprJson).toContain('parameters');
      expect(conditionExprJson).toContain(
        contractConditionWithAbiObj.parameters[0]
      );
      expect(conditionExprJson).toContain(
        contractConditionWithAbiObj.parameters[1]
      );
      expect(conditionExprJson).toContain('returnValueTest');
      expect(conditionExprJson).toContain('functionAbi');

      expect(conditionExprJson).not.toContain('standardContractType');
      expect(conditionExprJson).not.toContain('operator');
      expect(conditionExprJson).not.toContain('operands');

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(ContractCondition);
    });

    it('time condition serialization', () => {
      const conditionExpr = new ConditionExpression(timeCondition);

      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(testTimeConditionObj.method);
      expect(conditionExprJson).toContain('returnValueTest');
      expect(conditionExprJson).not.toContain('parameters');
      expect(conditionExprJson).not.toContain('contractAddress');
      expect(conditionExprJson).not.toContain('standardContractType');
      expect(conditionExprJson).not.toContain('functionAbi');
      expect(conditionExprJson).not.toContain('operator');
      expect(conditionExprJson).not.toContain('operands');

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(TimeCondition);
    });

    it('rpc condition serialization', () => {
      const conditionExpr = new ConditionExpression(rpcCondition);

      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(testRpcConditionObj.method);
      expect(conditionExprJson).toContain('parameters');
      expect(conditionExprJson).toContain(testRpcConditionObj.parameters[0]);
      expect(conditionExprJson).toContain('returnValueTest');
      expect(conditionExprJson).not.toContain('contractAddress');
      expect(conditionExprJson).not.toContain('standardContractType');
      expect(conditionExprJson).not.toContain('functionAbi');
      expect(conditionExprJson).not.toContain('operator');
      expect(conditionExprJson).not.toContain('operands');

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(RpcCondition);
    });

    it('compound condition serialization', () => {
      const conditionExpr = new ConditionExpression(compoundCondition);
      const compoundConditionObj = compoundCondition.toObj();

      const conditionExprJson = conditionExpr.toJson();
      expect(conditionExprJson).toContain('operator');
      expect(conditionExprJson).toContain(compoundConditionObj.operator);
      expect(conditionExprJson).toContain('operands');

      expect(conditionExprJson).toBeDefined();
      expect(conditionExprJson).toContain('chain');
      expect(conditionExprJson).toContain(TEST_CHAIN_ID.toString());
      expect(conditionExprJson).toContain('method');
      expect(conditionExprJson).toContain(testRpcConditionObj.method);
      expect(conditionExprJson).toContain(testTimeConditionObj.method);
      expect(conditionExprJson).toContain(testContractConditionObj.method);
      expect(conditionExprJson).toContain('parameters');
      expect(conditionExprJson).toContain(testRpcConditionObj.parameters[0]);
      expect(conditionExprJson).toContain(
        testContractConditionObj.parameters[0]
      );

      const conditionExprFromJson =
        ConditionExpression.fromJSON(conditionExprJson);
      expect(conditionExprFromJson).toBeDefined();
      expect(conditionExprFromJson.condition).toBeInstanceOf(CompoundCondition);
    });
  });
});
