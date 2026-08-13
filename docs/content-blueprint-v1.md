# JSTQB FL 500問 コンテンツblueprint v1

## 1. 目的と適用境界

本書は、JSTQB Foundation Level Version 2023V4.0.J02向け初回500問を、64学習目標（LO）へexact配分し、作問・検証・独立reviewを機械化するためのprivate source契約です。`allocationVersion: 1`がowner承認された場合にrelease invariantとなります。承認前は作問計画であり、D-04の判断を先取りして公開しません。

- 規範LO、Kレベル、章・LO quotaは`detailed-design-v2.md` §14.1と一致させます。
- 旧不合格500問、テス友、市販教材、第三者模試を生成・review入力に使用しません。
- 公式シラバスは概念・用語・LOの根拠に限り、設問文、選択肢、シナリオは独自に作成します。公式文面やサンプル問題の複製・翻案・長文転載を禁止します。
- 本書のschemaは全階層strictです。未知key、空白だけの文字列、配列重複、未登録enumを拒否します。

## 2. 共通語彙

### 2.1 認知操作

```ts
type CognitiveOperationV1 =
  | 'recognize'
  | 'map-artifact'
  | 'distinguish'
  | 'classify'
  | 'compare'
  | 'explain-causal'
  | 'interpret-evidence'
  | 'select-with-justification'
  | 'apply-technique'
  | 'calculate'
  | 'construct';
```

K1は`recognize | map-artifact`、K2は`distinguish | classify | compare | explain-causal | interpret-evidence | select-with-justification`を許可し、scenario固有の成果物対応を問う場合だけ`map-artifact`も許可します。K3は`apply-technique | calculate | construct`だけを許可します。`interpret-evidence`は、提示済みの計算結果、trace、coverage report等を解釈するK2操作であり、未提示の値を新たに算出する`calculate`と区別します。K2/K3では、正答導出に不可欠な具体的事実または作業成果物を最低1件要求します。用語を知っているだけで解けるK2/K3を拒否します。

### 2.2 問題形式

```ts
type QuestionFormV1 =
  | 'definition-recognition'
  | 'role-or-artifact-mapping'
  | 'scenario-classification'
  | 'cause-effect-explanation'
  | 'comparison'
  | 'best-action-with-rationale'
  | 'worked-application'
  | 'calculation'
  | 'artifact-construction'
  | 'defect-detection';

type OraclePolicyV1 = 'none' | 'conditional' | 'required';

type ForbiddenRuleCodeV1 =
  | 'assertion-word-cue'
  | 'choice-length-cue'
  | 'double-negation'
  | 'true-but-unrelated'
  | 'all-or-none-choice'
  | 'keyword-only'
  | 'name-or-title-only'
  | 'context-free-generalization'
  | 'unsupported-absolute'
  | 'unsupported-number'
  | 'missing-required-evidence'
  | 'single-factor-decision'
  | 'terminology-conflation'
  | 'product-knowledge-dependency'
  | 'compound-two-single-questions'
  | 'scenario-label-derivative'
  | 'privacy-or-hostile-content';
```

`allowedQuestionForms`は認知操作から次のliteral mapで導出します。別の対応を追加する場合はblueprint versionを上げます。

| cognitive operation | allowed question form |
|---|---|
| recognize | definition-recognition |
| map-artifact | role-or-artifact-mapping |
| distinguish, classify | scenario-classification |
| compare | comparison |
| explain-causal | cause-effect-explanation |
| interpret-evidence | worked-application, cause-effect-explanation |
| select-with-justification | best-action-with-rationale |
| apply-technique | worked-application, defect-detection |
| calculate | calculation |
| construct | artifact-construction, defect-detection |

全LOへ`assertion-word-cue | choice-length-cue | double-negation | true-but-unrelated | all-or-none-choice | compound-two-single-questions | scenario-label-derivative`を適用し、表の追加禁止codeとの和集合を`forbiddenRuleCodes`とします。禁止条件は上記enumだけで判定し、自由文から推測しません。

### 2.3 Evidence、数値、hashのprimitive

```ts
type Sha256HexV1 = string; // `/^[0-9a-f]{64}$/`
type UuidV1 = string; // lowercase canonical UUID
type IsoUtcTimestampV1 = string; // UTC millisecond固定の`YYYY-MM-DDTHH:mm:ss.SSSZ`
type PositiveSafeIntegerV1 = number; // runtimeで`Number.isSafeInteger(value) && value > 0`
type NonNegativeSafeIntegerV1 = number; // runtimeで`Number.isSafeInteger(value) && value >= 0`
type NonEmptyTrimmedStringV1 = string; // runtimeでtrim後1 grapheme以上、NUL・孤立surrogateなし
type Base64Url32BytesV1 = string; // `/^[A-Za-z0-9_-]{43}$/`かつbase64url no-padding decodeがexact 32 bytes
type Base64Url64BytesV1 = string; // `/^[A-Za-z0-9_-]{86}$/`かつbase64url no-padding decodeがexact 64 bytes
type CanonicalDecimalV1 = string;
type CanonicalRationalV1 = string;
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

type LearningObjectiveCodeV1 =
  | '1.1.1' | '1.1.2' | '1.2.1' | '1.2.2' | '1.2.3' | '1.3.1'
  | '1.4.1' | '1.4.2' | '1.4.3' | '1.4.4' | '1.4.5' | '1.5.1' | '1.5.2' | '1.5.3'
  | '2.1.1' | '2.1.2' | '2.1.3' | '2.1.4' | '2.1.5' | '2.1.6'
  | '2.2.1' | '2.2.2' | '2.2.3' | '2.3.1'
  | '3.1.1' | '3.1.2' | '3.1.3' | '3.2.1' | '3.2.2' | '3.2.3' | '3.2.4' | '3.2.5'
  | '4.1.1' | '4.2.1' | '4.2.2' | '4.2.3' | '4.2.4' | '4.3.1' | '4.3.2'
  | '4.3.3' | '4.4.1' | '4.4.2' | '4.4.3' | '4.5.1' | '4.5.2' | '4.5.3'
  | '5.1.1' | '5.1.2' | '5.1.3' | '5.1.4' | '5.1.5' | '5.1.6' | '5.1.7'
  | '5.2.1' | '5.2.2' | '5.2.3' | '5.2.4' | '5.3.1' | '5.3.2' | '5.3.3'
  | '5.4.1' | '5.5.1' | '6.1.1' | '6.2.1';

type ContentSelectionContractV1 =
  | { readonly selectionType: 'single'; readonly requiredChoiceCount: 1 }
  | { readonly selectionType: 'multiple'; readonly requiredChoiceCount: 2 };

type OracleInputValueV1 =
  | { readonly kind: 'scalar'; readonly value: CanonicalDecimalV1 }
  | { readonly kind: 'rational'; readonly value: CanonicalRationalV1 }
  | { readonly kind: 'rational-list'; readonly values: NonEmptyReadonlyArray<CanonicalRationalV1> };

type ScenarioFactKindV1 =
  | 'actor-role'
  | 'activity'
  | 'artifact-state'
  | 'timing'
  | 'sequence'
  | 'observed-outcome'
  | 'change'
  | 'constraint'
  | 'risk'
  | 'cost-or-effort'
  | 'scope'
  | 'dependency'
  | 'input-domain'
  | 'business-rule'
  | 'control-flow'
  | 'execution-trace'
  | 'coverage'
  | 'priority'
  | 'audience'
  | 'environment'
  | 'quality-characteristic'
  | 'history'
  | 'lifecycle'
  | 'communication-need'
  | 'tool-capability'
  | 'expected-actual';

type ScenarioArtifactKindV1 =
  | 'requirement-excerpt'
  | 'plan'
  | 'work-product'
  | 'log'
  | 'change-record'
  | 'risk-record'
  | 'trace-matrix'
  | 'role-matrix'
  | 'lifecycle-model'
  | 'pipeline'
  | 'architecture-model'
  | 'criterion-set'
  | 'review-record'
  | 'review-charter'
  | 'code-or-control-flow'
  | 'coverage-report'
  | 'test-design'
  | 'partition-table'
  | 'boundary-table'
  | 'decision-table'
  | 'state-model'
  | 'defect-history'
  | 'test-charter'
  | 'checklist'
  | 'user-story'
  | 'estimate-sheet'
  | 'backlog'
  | 'risk-register'
  | 'report'
  | 'communication-plan'
  | 'configuration-record'
  | 'defect-report'
  | 'tool-profile';

interface EvidenceRequirementV2 {
  readonly requiredMode: 'none' | 'at-least-one' | 'both';
  readonly requiredFactKinds: readonly ScenarioFactKindV1[];
  readonly requiredArtifactKinds: readonly ScenarioArtifactKindV1[];
  readonly permittedFactKinds: readonly ScenarioFactKindV1[];
  readonly permittedArtifactKinds: readonly ScenarioArtifactKindV1[];
}

type FormulaIdV1 =
  | 'partition-count.v1'
  | 'bva-two-value-set.v1'
  | 'bva-three-value-set.v1'
  | 'decision-rule-count.v1'
  | 'state-or-transition-coverage.v1'
  | 'statement-coverage.v1'
  | 'branch-coverage.v1'
  | 'ratio-estimate.v1'
  | 'extrapolation-estimate.v1'
  | 'three-point-estimate.v1'
  | 'risk-score.v1';

type RoundingModeV1 = 'none' | 'floor' | 'ceiling' | 'half-up' | 'half-even';
type NumericUnitV1 = 'count' | 'domain-value' | 'percent' | 'test-case' | 'person-hour' | 'person-day' | 'risk-score';
type FormulaInputUnitV1 =
  | 'count'
  | 'domain-value'
  | 'dimensionless'
  | 'work-unit'
  | 'person-hour'
  | 'person-day'
  | 'person-hour-per-work-unit'
  | 'person-day-per-work-unit';
type FormulaUnitVariantV1 = 'default' | 'person-hour' | 'person-day';
```

`CanonicalDecimalV1`は`^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$`へ一致し、`-0`、先頭`+`、末尾0、小数点だけを拒否します。`CanonicalRationalV1`は`^-?(0|[1-9][0-9]*)/[1-9][0-9]*$`へ一致し、分母正、最大公約数1、0は`0/1`だけを許可します。DTOに浮動小数を含めません。比率はbasis points整数で表し、1%は100 basis pointsです。`scalar`は入力資料に小数表記で与えられ、その表記自体が監査対象となる有限値、`rational`は分数によるexact値、`rational-list`は順序を持つ一件以上のexact値です。formula registryはformulaごとに許可するinput kindを固定し、kind間の暗黙変換を禁止します。

formula registryの正本は次の表です。各input keyのkind/unit/domain、unit variant、丸め、結果unitをliteralとして固定します。`integer`は分母1、`positive`は`>0`、`nonnegative`は`>=0`、`finite-rational`は有限のcanonical rationalです。入力keyの不足・余剰、kind/unit/domainの不一致、表にないvariant、cross constraint違反を拒否します。集合結果は昇順・重複なしです。

| formulaId / unitVariant | input key: exact kind / unit / domain | cross constraint / exact operation | rounding | result kind / unit |
|---|---|---|---|---|
| partition-count.v1 / default | validPartitionCount: scalar/count/nonnegative-integer; invalidPartitionCount: scalar/count/nonnegative-integer | 2 countの和 | none / 0 | scalar / count |
| bva-two-value-set.v1 / default | lowerBoundary: rational/domain-value/finite-rational; upperBoundary: rational/domain-value/finite-rational; step: rational/domain-value/positive-finite-rational | lowerBoundary <= upperBoundary; lower-step, lower, upper, upper+step | none / 0 | ordered-set / domain-value |
| bva-three-value-set.v1 / default | lowerBoundary: rational/domain-value/finite-rational; upperBoundary: rational/domain-value/finite-rational; step: rational/domain-value/positive-finite-rational | lowerBoundary <= upperBoundary; lower-step, lower, lower+step, upper-step, upper, upper+step | none / 0 | ordered-set / domain-value |
| decision-rule-count.v1 / default | conditionValueCounts: rational-list/count/positive-integer-each; impossibleRuleCount: scalar/count/nonnegative-integer | impossibleRuleCount < conditionValueCountsの積; 積からimpossibleRuleCountを減算 | none / 0 | scalar / test-case |
| state-or-transition-coverage.v1 / default | coveredCount: scalar/count/nonnegative-integer; totalCount: scalar/count/positive-integer | coveredCount <= totalCount; coveredCount / totalCount × 100 | half-up / 2 | scalar / percent |
| statement-coverage.v1 / default | executedStatementCount: scalar/count/nonnegative-integer; totalStatementCount: scalar/count/positive-integer | executedStatementCount <= totalStatementCount; executedStatementCount / totalStatementCount × 100 | half-up / 2 | scalar / percent |
| branch-coverage.v1 / default | executedBranchCount: scalar/count/nonnegative-integer; totalBranchCount: scalar/count/positive-integer | executedBranchCount <= totalBranchCount; executedBranchCount / totalBranchCount × 100 | half-up / 2 | scalar / percent |
| ratio-estimate.v1 / person-hour | workUnits: rational/work-unit/nonnegative-finite-rational; effortPerUnit: rational/person-hour-per-work-unit/positive-finite-rational | workUnits × effortPerUnit | half-up / 2 | scalar / person-hour |
| ratio-estimate.v1 / person-day | workUnits: rational/work-unit/nonnegative-finite-rational; effortPerUnit: rational/person-day-per-work-unit/positive-finite-rational | workUnits × effortPerUnit | half-up / 2 | scalar / person-day |
| extrapolation-estimate.v1 / person-hour | observedEffort: rational/person-hour/nonnegative-finite-rational; observedWork: rational/work-unit/positive-finite-rational; remainingWork: rational/work-unit/nonnegative-finite-rational | observedEffort / observedWork × remainingWork | half-up / 2 | scalar / person-hour |
| extrapolation-estimate.v1 / person-day | observedEffort: rational/person-day/nonnegative-finite-rational; observedWork: rational/work-unit/positive-finite-rational; remainingWork: rational/work-unit/nonnegative-finite-rational | observedEffort / observedWork × remainingWork | half-up / 2 | scalar / person-day |
| three-point-estimate.v1 / person-hour | optimistic, mostLikely, pessimistic: rational/person-hour/nonnegative-finite-rational | optimistic <= mostLikely <= pessimistic; (optimistic + 4 × mostLikely + pessimistic) / 6 | half-up / 2 | scalar / person-hour |
| three-point-estimate.v1 / person-day | optimistic, mostLikely, pessimistic: rational/person-day/nonnegative-finite-rational | optimistic <= mostLikely <= pessimistic; (optimistic + 4 × mostLikely + pessimistic) / 6 | half-up / 2 | scalar / person-day |
| risk-score.v1 / default | likelihood: rational/dimensionless/positive-integer; impact: rational/dimensionless/positive-integer | likelihood × impact | none / 0 | scalar / risk-score |

## 3. strict schema

### 3.1 LO blueprint

```ts
type KLevelV1 = 1 | 2 | 3;
type ChapterNumberV1 = 1 | 2 | 3 | 4 | 5 | 6;

interface PatternFamilyV1 {
  readonly familyId: string; // `/^[1-6]\.[0-9]+\.[0-9]+:pf(0[1-9]|[1-9][0-9])$/`
  readonly name: string;
  readonly discriminatingReasoning: string;
}

interface LoQuestionBlueprintEntryV1 {
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly chapterNumber: ChapterNumberV1;
  readonly exactQuota: number;
  readonly derivedKLevel: KLevelV1;
  readonly allowedCognitiveOperations: NonEmptyReadonlyArray<CognitiveOperationV1>;
  readonly allowedQuestionForms: NonEmptyReadonlyArray<QuestionFormV1>;
  readonly forbiddenRuleCodes: NonEmptyReadonlyArray<ForbiddenRuleCodeV1>;
  readonly evidenceRequirement: EvidenceRequirementV2;
  readonly representativeMisconceptionCodes: NonEmptyReadonlyArray<string>;
  readonly patternFamilies: NonEmptyReadonlyArray<PatternFamilyV1>;
  readonly numericOraclePolicy: OraclePolicyV1;
}

interface MultipleAllocationV1 {
  readonly exactCount: 60;
  readonly requiredChoiceCount: 2;
  readonly chapterCounts: readonly [12, 9, 6, 17, 13, 3];
  readonly kLevelCounts: readonly [6, 39, 15];
}

interface LoQuestionBlueprintV1 {
  readonly schemaVersion: 'lo-question-blueprint.v1';
  readonly allocationVersion: 1;
  readonly certificationCode: 'JSTQB-FL';
  readonly syllabusVersion: '2023V4.0.J02';
  readonly exactQuestionCount: 500;
  readonly exactLearningObjectiveCount: 64;
  readonly chapterCounts: readonly [100, 75, 50, 138, 112, 25];
  readonly kLevelCounts: readonly [100, 300, 100];
  readonly singleChoiceCount: 440;
  readonly multipleChoice: MultipleAllocationV1;
  readonly patternFamilyMaximumShareBasisPoints: 3500;
  readonly formulaRegistryId: 'jstqb-fl-formula-registry.v1';
  readonly formulaRegistryDigest: Sha256HexV1;
  readonly independentOracleRunnerId: NonEmptyTrimmedStringV1;
  readonly independentOracleRunnerDigest: Sha256HexV1;
  readonly entries: readonly LoQuestionBlueprintEntryV1[];
}
```

### 3.2 private question

```ts
interface ScenarioFactV1 {
  readonly factKey: string;
  readonly kind: ScenarioFactKindV1;
  readonly statement: string;
  readonly answerRelevance: 'required' | 'context';
}

interface ScenarioArtifactV1 {
  readonly artifactKey: string;
  readonly kind: ScenarioArtifactKindV1;
  readonly body: string;
  readonly answerRelevance: 'required' | 'context';
}

interface PremiseV1 {
  readonly premiseKey: string;
  readonly statement: string;
  readonly sourceFactKeys: readonly string[];
  readonly sourceArtifactKeys: readonly string[];
}

interface AskedClaimV1 {
  readonly claimKey: string;
  readonly premiseKeys: NonEmptyReadonlyArray<string>;
  readonly cognitiveOperation: CognitiveOperationV1;
  readonly requestedJudgement: string;
}

type ChoiceErrorTypeV1 =
  | 'none'
  | 'adjacent-concept'
  | 'reversed-causality'
  | 'wrong-scope'
  | 'partial-correction'
  | 'wrong-artifact-or-role'
  | 'wrong-calculation'
  | 'unsupported-assumption';

interface PrivateChoiceV3 {
  readonly choiceStableId: string;
  readonly label: string;
  readonly body: string;
  readonly claim: string;
  readonly relevantPremiseKeys: NonEmptyReadonlyArray<string>;
  readonly relevantClaimKeys: NonEmptyReadonlyArray<string>;
  readonly addressedPremiseKeys: readonly string[];
  readonly addressedClaimKeys: readonly string[];
  readonly misconceptionCode: string | null;
  readonly errorType: ChoiceErrorTypeV1;
  readonly explanation: string;
  readonly sortOrder: number;
}

type PrivateChoiceListV3 =
  | readonly [PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3]
  | readonly [PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3]
  | readonly [PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3]
  | readonly [PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3]
  | readonly [PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3, PrivateChoiceV3];

type ValidatedChoiceV3 =
  | {
      readonly classification: 'correct-derived-from-correctChoiceStableIds';
      readonly choice: PrivateChoiceV3 & { readonly misconceptionCode: null; readonly errorType: 'none' };
    }
  | {
      readonly classification: 'incorrect-derived-from-correctChoiceStableIds';
      readonly choice: PrivateChoiceV3 & {
        readonly misconceptionCode: string;
        readonly errorType: Exclude<ChoiceErrorTypeV1, 'none'>;
        readonly addressedPremiseKeys: readonly [];
        readonly addressedClaimKeys: readonly [];
      };
    };

interface ReasoningStepV1 {
  readonly stepNumber: PositiveSafeIntegerV1;
  readonly inputFactKeys: readonly string[];
  readonly inputArtifactKeys: readonly string[];
  readonly premiseKeys: NonEmptyReadonlyArray<string>;
  readonly conclusionClaimKey: string;
  readonly explanation: string;
}

type ReasoningStepListV1 = NonEmptyReadonlyArray<ReasoningStepV1>; // generated schemaで1〜12件

type NumericExpectedV1 =
  | {
      readonly kind: 'scalar';
      readonly exactValue: CanonicalRationalV1;
      readonly displayedValue: CanonicalDecimalV1;
    }
  | {
      readonly kind: 'ordered-set';
      readonly exactValues: NonEmptyReadonlyArray<CanonicalRationalV1>;
      readonly displayedValues: NonEmptyReadonlyArray<CanonicalDecimalV1>;
    };

interface ClaimCalculationV1 {
  readonly claimKey: string;
  readonly formulaId: FormulaIdV1;
  readonly unitVariant: FormulaUnitVariantV1;
  readonly inputs: Readonly<Record<string, OracleInputValueV1>>;
  readonly intermediateValues: NonEmptyReadonlyArray<{ readonly key: string; readonly value: CanonicalRationalV1 }>;
  readonly rounding: { readonly mode: RoundingModeV1; readonly scale: 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  readonly expected: NumericExpectedV1;
  readonly unit: NumericUnitV1;
  readonly choiceValueBindings: NonEmptyReadonlyArray<{
    readonly choiceStableId: string;
    readonly candidateValue: NumericExpectedV1;
  }>;
}

interface NumericOracleVerificationEntryV1 {
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly claimKey: NonEmptyTrimmedStringV1;
  readonly formulaId: FormulaIdV1;
  readonly unitVariant: FormulaUnitVariantV1;
  readonly inputs: Readonly<Record<string, OracleInputValueV1>>;
  readonly intermediateValues: NonEmptyReadonlyArray<{
    readonly key: NonEmptyTrimmedStringV1;
    readonly value: CanonicalRationalV1;
  }>;
  readonly rounding: { readonly mode: RoundingModeV1; readonly scale: 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  readonly expected: NumericExpectedV1;
  readonly oracle: NumericExpectedV1;
  readonly unit: NumericUnitV1;
  readonly choiceValueBindings: NonEmptyReadonlyArray<{
    readonly choiceStableId: NonEmptyTrimmedStringV1;
    readonly candidateValue: NumericExpectedV1;
  }>;
}

interface NumericOracleVerificationArtifactV1 {
  readonly schemaVersion: 'numeric-oracle-verification-artifact.v1';
  readonly canonicalHash: Sha256HexV1;
  readonly formulaRegistryId: NonEmptyTrimmedStringV1;
  readonly formulaRegistryDigest: Sha256HexV1;
  readonly independentOracleRunnerId: NonEmptyTrimmedStringV1;
  readonly independentOracleRunnerDigest: Sha256HexV1;
  readonly entries: NonEmptyReadonlyArray<NumericOracleVerificationEntryV1>;
  readonly verifiedAt: IsoUtcTimestampV1;
  readonly numericOracleVerificationArtifactHash: Sha256HexV1;
}

type NumericOracleV2 =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'calculation';
      readonly oracleSchemaVersion: 'numeric-oracle.v2';
      readonly formulaRegistryId: 'jstqb-fl-formula-registry.v1';
      readonly formulaRegistryDigest: Sha256HexV1;
      readonly independentRunnerId: NonEmptyTrimmedStringV1;
      readonly independentRunnerDigest: Sha256HexV1;
      readonly calculations: NonEmptyReadonlyArray<ClaimCalculationV1>;
    };

interface ContentProvenanceV2 {
  readonly schemaVersion: 'content-provenance.v2';
  readonly origin: 'independent-original';
  readonly normativeSources: NonEmptyReadonlyArray<{
    readonly sourceId: 'ISTQB-CTFL-4.0.1' | 'JSTQB-FL-2023V4.0.J02';
    readonly chapterCode: string;
    readonly sectionCode: string;
    readonly learningObjectiveCode: LearningObjectiveCodeV1;
  }>;
  readonly externalProblemSources: readonly [];
  readonly officialSampleProblemUsed: false;
  readonly oldRejectedBundleUsed: false;
  readonly authoredAt: IsoUtcTimestampV1;
  readonly accountableHuman: {
    readonly principalId: UuidV1;
    readonly accountabilityReviewArtifactHash: Sha256HexV1;
  };
  readonly generation:
    | { readonly mode: 'human-only'; readonly modelRuns: readonly [] }
    | {
        readonly mode: 'model-assisted';
        readonly modelRuns: NonEmptyReadonlyArray<{
          readonly provider: NonEmptyTrimmedStringV1;
          readonly modelId: NonEmptyTrimmedStringV1;
          readonly modelDigest: Sha256HexV1;
          readonly runId: NonEmptyTrimmedStringV1;
        }>;
      };
  readonly terminology: {
    readonly allowlistId: NonEmptyTrimmedStringV1;
    readonly allowlistDigest: Sha256HexV1;
    readonly result: 'pass';
  };
  readonly copyright: {
    readonly corpusRegistryId: NonEmptyTrimmedStringV1;
    readonly corpusRegistryDigest: Sha256HexV1;
    readonly tokenizerId: NonEmptyTrimmedStringV1;
    readonly tokenizerDigest: Sha256HexV1;
    readonly thirdPartyProblemMatchCount: 0;
    readonly officialSampleProblemMatchCount: 0;
    readonly perCorpusMatchCounts: readonly {
      readonly corpusId: NonEmptyTrimmedStringV1;
      readonly matchCount: 0;
    }[];
    readonly detectedSpans: readonly {
      readonly sourceId: NonEmptyTrimmedStringV1;
      readonly graphemeCount: PositiveSafeIntegerV1;
      readonly classification: 'approved-official-term' | 'reviewed-nonproblem-normative-fragment';
      readonly reviewArtifactHash: Sha256HexV1;
    }[];
    readonly humanReviewResult: 'pass';
    readonly humanReviewArtifactHash: Sha256HexV1;
  };
}

interface ContentPrivateQuestionBaseV3 {
  readonly schemaVersion: 'content-private-question.v3';
  readonly allocationVersion: 1;
  readonly blueprintVersion: 'lo-question-blueprint.v1';
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly versionNumber: PositiveSafeIntegerV1;
  readonly certificationCode: 'JSTQB-FL';
  readonly syllabusVersion: '2023V4.0.J02';
  readonly chapterNumber: ChapterNumberV1;
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly kLevel: KLevelV1;
  readonly cognitiveOperation: CognitiveOperationV1;
  readonly patternFamilyId: string;
  readonly questionForm: QuestionFormV1;
  readonly examEligibility: 'eligible' | 'practice-only';
  readonly distributionScope: 'release_candidate';
  readonly difficulty: 1 | 2 | 3;
  readonly shuffleChoices: boolean;
  readonly prompt: string;
  readonly scenarioFacts: readonly ScenarioFactV1[];
  readonly scenarioArtifacts: readonly ScenarioArtifactV1[];
  readonly premises: NonEmptyReadonlyArray<PremiseV1>;
  readonly askedClaims: NonEmptyReadonlyArray<AskedClaimV1>;
  readonly choices: PrivateChoiceListV3;
  readonly correctChoiceStableIds: NonEmptyReadonlyArray<string>;
  readonly questionExplanation: string;
  readonly reasoningSteps: ReasoningStepListV1;
  readonly takeaway: string;
  readonly commonTrap: string;
  readonly sourceReference: string;
  readonly compatibility: 'compatible' | 'breaking' | 'cosmetic';
  readonly numericOracle: NumericOracleV2;
  readonly provenance: ContentProvenanceV2;
  readonly audits: {
    readonly japaneseLanguageStatus: 'pass';
    readonly terminologyStatus: 'pass';
    readonly semanticSimilarityStatus: 'pass';
    readonly choiceCueStatus: 'pass';
    readonly calculationStatus: 'not-applicable' | 'pass';
  };
  readonly reviewStatus: 'draft' | 'reviewing';
}

type ContentPrivateQuestionV3 = ContentPrivateQuestionBaseV3 & ContentSelectionContractV1;

type ContentPrivateQuestionAccountabilitySubjectV1 =
  Omit<ContentPrivateQuestionV3, 'provenance'> & {
    readonly provenance: Omit<ContentProvenanceV2, 'accountableHuman'> & {
      readonly accountableHuman: { readonly principalId: UuidV1 };
    };
  };

interface ContentAccountabilityReviewArtifactV1 {
  readonly schemaVersion: 'content-accountability-review-artifact.v1';
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly subjectHash: Sha256HexV1;
  readonly principalId: UuidV1;
  readonly identityAssertion: {
    readonly method: 'recent-authenticated-human';
    readonly assertionId: UuidV1;
    readonly assertionArtifactHash: Sha256HexV1;
    readonly assertedPrincipalId: UuidV1;
    readonly assertedAt: IsoUtcTimestampV1;
  };
  readonly reviewedAt: IsoUtcTimestampV1;
  readonly result: 'pass';
  readonly statementVersion: 'content-accountability-statement.v1';
  readonly statementHash: Sha256HexV1;
}

interface ContentIdentityAssertionArtifactV1 {
  readonly schemaVersion: 'content-identity-assertion-artifact.v1';
  readonly assertionId: UuidV1;
  readonly subjectPrincipalId: UuidV1;
  readonly actorKind: 'human';
  readonly purpose: 'content-accountability-review';
  readonly audience: 'jstqb-content-release-v2';
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly subjectHash: Sha256HexV1;
  readonly statementVersion: 'content-accountability-statement.v1';
  readonly statementHash: Sha256HexV1;
  readonly authMethod: 'recent-auth';
  readonly authenticatedAt: IsoUtcTimestampV1;
  readonly issuedAt: IsoUtcTimestampV1;
  readonly expiresAt: IsoUtcTimestampV1;
  readonly issuer: NonEmptyTrimmedStringV1;
  readonly keyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly nonce: Base64Url32BytesV1;
  readonly signature: Base64Url64BytesV1;
}

interface ContentAccountabilityIssuerTrustKeyV1 {
  readonly issuer: NonEmptyTrimmedStringV1;
  readonly keyId: NonEmptyTrimmedStringV1;
  readonly algorithm: 'Ed25519';
  readonly publicKey: Base64Url32BytesV1;
  readonly validFrom: IsoUtcTimestampV1;
  readonly validUntil: IsoUtcTimestampV1;
  readonly status: 'active' | 'revoked';
}

interface ContentAccountabilityStatementRegistryV1 {
  readonly schemaVersion: 'content-accountability-statement-registry.v1';
  readonly statements: readonly [{
    readonly statementVersion: 'content-accountability-statement.v1';
    readonly statementLiteral: '私は、指定された問題版と固定subjectを確認し、公開前の内容説明責任を引き受けます。';
  }];
  readonly registryDigest: Sha256HexV1;
}

interface ContentCopyrightCorpusRegistryV1 {
  readonly schemaVersion: 'content-copyright-corpus-registry.v1';
  readonly registryId: NonEmptyTrimmedStringV1;
  readonly asOf: IsoUtcTimestampV1;
  readonly entries: NonEmptyReadonlyArray<{
    readonly corpusId: NonEmptyTrimmedStringV1;
    readonly corpusDigest: Sha256HexV1;
    readonly scope: NonEmptyTrimmedStringV1;
    readonly licenseReviewArtifactHash: Sha256HexV1;
  }>;
  readonly registryDigest: Sha256HexV1;
}

type LearningObjectiveCountsV1 = {
  readonly [K in LearningObjectiveCodeV1]: PositiveSafeIntegerV1;
};

interface ContentOfficialExamStructureBasisV1 {
  readonly schemaVersion: 'content-official-exam-structure-basis.v1';
  readonly certificationCode: 'CTFL';
  readonly syllabusVersion: 'JSTQB-FL-2023V4.0.J02';
  readonly sourceDocumentTitle: 'ISTQB Exam Structure Tables';
  readonly sourceDocumentVersion: 'v1.18';
  readonly sourceDocumentHash: Sha256HexV1;
  readonly sourceReviewedAt: IsoUtcTimestampV1;
  readonly examQuestionCount: 40;
  readonly chapterQuestionCounts: readonly [8, 6, 4, 11, 9, 2];
  readonly kLevelQuestionCounts: readonly [8, 24, 8];
  readonly scalingRule: 'multiply-by-500-divide-by-40';
  readonly roundingRule: 'floor-then-largest-fractional-remainder-chapter-number-ascending-tie-break';
  readonly officialExamStructureBasisHash: Sha256HexV1;
}

interface ContentAllocationDefinitionV1 {
  readonly schemaVersion: 'content-allocation-definition.v1';
  readonly allocationVersion: 1;
  readonly initialQuestionCount: 500;
  readonly officialExamStructureBasis: ContentOfficialExamStructureBasisV1;
  readonly chapterCounts: readonly [100, 75, 50, 138, 112, 25];
  readonly kLevelCounts: { readonly k1: 100; readonly k2: 300; readonly k3: 100 };
  readonly singleChoiceCount: 440;
  readonly multipleChoiceCount: 60;
  readonly multipleChoiceChapterCounts: readonly [12, 9, 6, 17, 13, 3];
  readonly multipleChoiceKLevelCounts: readonly [6, 39, 15];
  readonly multipleRequiredChoiceCount: 2;
  readonly learningObjectiveCounts: LearningObjectiveCountsV1;
}

interface ContentQualityGateConfigV1 {
  readonly gateVersion: 'content-quality-gate.v1';
  readonly tokenizerId: NonEmptyTrimmedStringV1;
  readonly tokenizerDigest: Sha256HexV1;
  readonly embeddingModelId: NonEmptyTrimmedStringV1;
  readonly embeddingModelDigest: Sha256HexV1;
  readonly calibrationCorpusHash: Sha256HexV1;
  readonly formulaRegistryId: NonEmptyTrimmedStringV1;
  readonly formulaRegistryDigest: Sha256HexV1;
  readonly independentOracleRunnerId: NonEmptyTrimmedStringV1;
  readonly independentOracleRunnerDigest: Sha256HexV1;
  readonly normalizedSignatureDuplicateMax: 0;
  readonly embeddingRejectBasisPoints: 8200;
  readonly embeddingReviewBasisPoints: 8200;
  readonly patternFamilyMaxShareBasisPoints: 3500;
  readonly multipleLiteralPremiseDistractorMaxShareBasisPoints: 2000;
  readonly patternFamilyMinimumRule: readonly [
    { readonly quotaMin: 5; readonly quotaMax: 5; readonly minimumFamilies: 5 },
    { readonly quotaMin: 6; readonly quotaMax: 8; readonly minimumFamilies: 4 },
    { readonly quotaMin: 9; readonly quotaMax: 11; readonly minimumFamilies: 5 },
    { readonly quotaMin: 12; readonly quotaMax: 500; readonly minimumFamilies: 6 }
  ];
  readonly meanLengthDifferenceMaxBasisPoints: 2000;
  readonly assertionRateDifferenceMaxBasisPoints: 1000;
  readonly negationRateDifferenceMaxBasisPoints: 1000;
  readonly globalPositionDeviationMaxBasisPoints: 500;
  readonly stratumPositionDeviationMaxBasisPoints: 1000;
  readonly stratumMinimumSize: 20;
  readonly numericOracleAgreement: 1;
  readonly blindSolveDisagreementMax: 0;
  readonly unresolvedIssueMax: 0;
}

interface ContentAllocationApprovalArtifactV1 {
  readonly schemaVersion: 'content-allocation-approval-artifact.v1';
  readonly allocationHash: Sha256HexV1;
  readonly decision: 'owner_approved';
  readonly approvedBy: UuidV1;
  readonly approvedAt: IsoUtcTimestampV1;
  readonly ownerDecisionReference: 'D-04';
  readonly sourceDesignDocumentHash: Sha256HexV1;
}

interface ContentVersionRefV1 {
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
}

type ContentReviewTypeV2 =
  | 'machine-gate'
  | 'blind-solve'
  | 'personal-human'
  | 'technical'
  | 'editorial'
  | 'mobile-web-preview';

type ContentReviewSubjectV2 =
  | { readonly type: 'human'; readonly principalId: UuidV1 }
  | {
      readonly type: 'system-run';
      readonly runnerId: NonEmptyTrimmedStringV1;
      readonly runnerDigest: Sha256HexV1;
      readonly runId: NonEmptyTrimmedStringV1;
    }
  | {
      readonly type: 'model-run';
      readonly provider: NonEmptyTrimmedStringV1;
      readonly modelId: NonEmptyTrimmedStringV1;
      readonly modelDigest: Sha256HexV1;
      readonly runId: NonEmptyTrimmedStringV1;
    };

interface ContentReviewArtifactBaseV2 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-review-artifact.v2';
  readonly reviewType: ContentReviewTypeV2;
  readonly subject: ContentReviewSubjectV2;
  readonly result: 'pass';
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly evidenceHash: Sha256HexV1;
  readonly artifactHash: Sha256HexV1;
  readonly reviewedAt: IsoUtcTimestampV1;
}

type ContentReviewArtifactV2 =
  | (ContentReviewArtifactBaseV2 & {
      readonly reviewType: 'machine-gate';
      readonly subject: Extract<ContentReviewSubjectV2, { readonly type: 'system-run' }>;
      readonly fullReportHash: Sha256HexV1;
    })
  | (ContentReviewArtifactBaseV2 & {
      readonly reviewType: 'blind-solve';
      readonly subject: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
      readonly blindPacketHash: Sha256HexV1;
      readonly submittedChoiceStableIds: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
      readonly rationaleArtifactHash: Sha256HexV1;
      readonly submittedAt: IsoUtcTimestampV1;
      readonly answerKeyDisclosedAt: IsoUtcTimestampV1;
      readonly correctSetMatched: true;
    })
  | (ContentReviewArtifactBaseV2 & {
      readonly reviewType: 'personal-human' | 'technical' | 'editorial' | 'mobile-web-preview';
      readonly subject: Extract<ContentReviewSubjectV2, { readonly type: 'human' }>;
      readonly checklistVersion: NonEmptyTrimmedStringV1;
      readonly checklistResultArtifactHash: Sha256HexV1;
    });

interface ContentReviewCoverageV2 {
  readonly schemaVersion: 'content-review-coverage.v2';
  readonly requiredRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly reviewType: ContentReviewTypeV2;
  }>;
  readonly artifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly reviewType: ContentReviewTypeV2;
    readonly subject: ContentReviewSubjectV2;
    readonly artifactHash: Sha256HexV1;
  }>;
  readonly issueRefs: readonly (ContentVersionRefV1 & { readonly issueId: UuidV1 })[];
  readonly reviewCoverageHash: Sha256HexV1;
}

type ContentAiReviewPassIdV1 =
  | 'g0-schema-canonical'
  | 'g1-question-validity'
  | 'g2-blind-solve'
  | 'g3-answer-evidence'
  | 'g4-multiple-bijection'
  | 'g5-distractor-ambiguity'
  | 'g6-cue-japanese'
  | 'g7-lo-k-difficulty'
  | 'g8-numeric-oracle'
  | 'g9-duplicate-similarity'
  | 'g10-copyright-provenance'
  | 'g11-ui-a11y-render'
  | 'g12-adjudication';

type ContentAiReviewOutcomeV1 =
  | { readonly result: 'pass'; readonly notApplicableReason: null }
  | {
      readonly result: 'not-applicable';
      readonly notApplicableReason: 'not-multiple-selection' | 'no-numeric-claim';
    };

interface ContentGenerationArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-generation-artifact.v1';
  readonly generatedSubjectHash: Sha256HexV1;
  readonly generationPolicyVersion: NonEmptyTrimmedStringV1;
  readonly generationInputPacketHash: Sha256HexV1;
  readonly generator: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
  readonly generatedAt: IsoUtcTimestampV1;
  readonly artifactHash: Sha256HexV1;
}

interface ContentAiEvaluationArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-ai-evaluation-artifact.v1';
  readonly passId: Exclude<ContentAiReviewPassIdV1, 'g2-blind-solve' | 'g12-adjudication'>;
  readonly evaluator: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly inputPacketHash: Sha256HexV1;
  readonly deterministicEvidenceHash: Sha256HexV1;
  readonly evaluationResultArtifactHash: Sha256HexV1;
  readonly outcome: ContentAiReviewOutcomeV1;
  readonly evaluatedAt: IsoUtcTimestampV1;
  readonly artifactHash: Sha256HexV1;
}

interface ContentAiBlindSolveArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-ai-blind-solve-artifact.v1';
  readonly passId: 'g2-blind-solve';
  readonly reviewer: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly blindPacketHash: Sha256HexV1;
  readonly submittedChoiceStableIds: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
  readonly rationaleArtifactHash: Sha256HexV1;
  readonly submittedAt: IsoUtcTimestampV1;
  readonly answerKeyDisclosedAt: IsoUtcTimestampV1;
  readonly correctSetMatched: true;
  readonly artifactHash: Sha256HexV1;
}

interface ContentAiAdjudicationArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-ai-adjudication-artifact.v1';
  readonly passId: 'g12-adjudication';
  readonly adjudicator: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly prerequisiteArtifactHashes: readonly [
    Sha256HexV1, Sha256HexV1, Sha256HexV1, Sha256HexV1,
    Sha256HexV1, Sha256HexV1, Sha256HexV1, Sha256HexV1,
    Sha256HexV1, Sha256HexV1, Sha256HexV1, Sha256HexV1
  ];
  readonly adjudicationResultArtifactHash: Sha256HexV1;
  readonly unresolvedBlockingCount: 0;
  readonly unresolvedHighCount: 0;
  readonly result: 'pass';
  readonly adjudicatedAt: IsoUtcTimestampV1;
  readonly artifactHash: Sha256HexV1;
}

interface ContentAiReviewCoverageV1 {
  readonly schemaVersion: 'content-ai-review-coverage.v1';
  readonly expectedQuestionCount: 500;
  readonly expectedGenerationArtifactCount: 500;
  readonly expectedPassCountPerQuestion: 13;
  readonly expectedReviewArtifactCount: 6500;
  readonly expectedQuestionRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly generationArtifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly artifactHash: Sha256HexV1;
  }>;
  readonly requiredPassRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly passId: ContentAiReviewPassIdV1;
  }>;
  readonly reviewArtifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly passId: ContentAiReviewPassIdV1;
    readonly artifactHash: Sha256HexV1;
  }>;
  readonly staleArtifactRefs: readonly (ContentVersionRefV1 & {
    readonly passId: ContentAiReviewPassIdV1;
    readonly artifactHash: Sha256HexV1;
  })[];
  readonly unresolvedIssueRefs: readonly (ContentVersionRefV1 & {
    readonly issueId: UuidV1;
  })[];
  readonly aiReviewCoverageHash: Sha256HexV1;
}

type ContentOwnerPersonalReviewDecisionV1 =
  | { readonly decision: 'pass'; readonly changesRequiredIssueId: null }
  | { readonly decision: 'changes_required'; readonly changesRequiredIssueId: UuidV1 };

interface ContentOwnerPersonalReviewArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-owner-personal-review-artifact.v1';
  readonly owner: Extract<ContentReviewSubjectV2, { readonly type: 'human' }>;
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly blindPacketHash: Sha256HexV1;
  readonly blindPacketDisclosureCounts: {
    readonly correctChoiceStableIds: 0;
    readonly questionExplanation: 0;
    readonly choiceExplanations: 0;
    readonly takeaway: 0;
    readonly commonTrap: 0;
  };
  readonly blindSubmittedChoiceStableIds: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
  readonly blindRationaleArtifactHash: Sha256HexV1;
  readonly blindSubmittedAt: IsoUtcTimestampV1;
  readonly answerKeyDisclosedAt: IsoUtcTimestampV1;
  readonly revealStateTransitions: readonly ['blind', 'revealed', 'hidden', 'audit-completed'];
  readonly revealedAuditArtifactHash: Sha256HexV1;
  readonly checklistVersion: NonEmptyTrimmedStringV1;
  readonly checklistResultArtifactHash: Sha256HexV1;
  readonly outcome: ContentOwnerPersonalReviewDecisionV1;
  readonly reviewedAt: IsoUtcTimestampV1;
  readonly artifactHash: Sha256HexV1;
}

interface ContentOwnerPersonalReviewCoverageV1 {
  readonly schemaVersion: 'content-owner-personal-review-coverage.v1';
  readonly expectedQuestionCount: 500;
  readonly expectedQuestionRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly currentArtifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly artifactHash: Sha256HexV1;
    readonly decision: 'pass' | 'changes_required';
  }>;
  readonly changesRequiredIssueRefs: readonly (ContentVersionRefV1 & {
    readonly issueId: UuidV1;
  })[];
  readonly ownerPersonalReviewCoverageHash: Sha256HexV1;
}

interface ContentIdentityAssertionCoverageV1 {
  readonly schemaVersion: 'content-identity-assertion-coverage.v1';
  readonly requiredRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly artifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly assertionArtifactHash: Sha256HexV1;
  }>;
  readonly identityAssertionCoverageHash: Sha256HexV1;
}

interface ContentAccountabilityCoverageV1 {
  readonly schemaVersion: 'content-accountability-coverage.v1';
  readonly requiredRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly artifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly accountabilityReviewArtifactHash: Sha256HexV1;
  }>;
  readonly accountabilityCoverageHash: Sha256HexV1;
}

interface ContentProvenanceCoverageV1 {
  readonly schemaVersion: 'content-provenance-coverage.v1';
  readonly requiredRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly artifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly provenanceCanonicalHash: Sha256HexV1;
  }>;
  readonly provenanceCoverageHash: Sha256HexV1;
}

interface ContentProvenanceCanonicalArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-provenance-canonical-artifact.v1';
  readonly provenance: ContentProvenanceV2;
  readonly provenanceCanonicalHash: Sha256HexV1;
}

interface PersonalHumanReviewSamplingArtifactV1 {
  readonly schemaVersion: 'personal-human-review-sampling-artifact.v1';
  readonly samplingId: UuidV1;
  readonly samplingFreezeHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly blueprintHash: Sha256HexV1;
  readonly allocationHash: Sha256HexV1;
  readonly qualityGateConfigHash: Sha256HexV1;
  readonly seedBase64Url: Base64Url32BytesV1;
  readonly issuedAt: IsoUtcTimestampV1;
  readonly issuerServiceId: NonEmptyTrimmedStringV1;
  readonly issuerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly samplingRulesVersion: 'personal-human-review-sampling.v1';
  readonly strata: NonEmptyReadonlyArray<{
    readonly chapterNumber: ChapterNumberV1;
    readonly kLevel: 1 | 2;
    readonly selectionType: 'single' | 'multiple';
    readonly populationCount: PositiveSafeIntegerV1;
    readonly quota: PositiveSafeIntegerV1;
    readonly populationHash: Sha256HexV1;
    readonly memberRefs: NonEmptyReadonlyArray<{
      readonly questionStableId: NonEmptyTrimmedStringV1;
      readonly versionStableKey: NonEmptyTrimmedStringV1;
      readonly rankHash: Sha256HexV1;
      readonly selectedByStratumSample: boolean;
    }>;
    readonly cutoffRankHash: Sha256HexV1;
  }>;
  readonly mandatorySelectedRefs: NonEmptyReadonlyArray<{
    readonly questionStableId: NonEmptyTrimmedStringV1;
    readonly versionStableKey: NonEmptyTrimmedStringV1;
    readonly selectionReasons: NonEmptyReadonlyArray<
      'k3-all' | 'multiple-all' | 'blind-disagreement-all' | 'carry-forward'
    >;
  }>;
  readonly finalSelectedRefs: NonEmptyReadonlyArray<{
    readonly questionStableId: NonEmptyTrimmedStringV1;
    readonly versionStableKey: NonEmptyTrimmedStringV1;
  }>;
  readonly signature: Base64Url64BytesV1;
}

interface ContentCanonicalQuestionLearningMetadataV3 {
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly cognitiveOperation: CognitiveOperationV1;
  readonly patternFamilyId: string;
  readonly questionForm: QuestionFormV1;
  readonly examEligibility: 'eligible' | 'practice-only';
  readonly distributionScope: 'release_candidate';
  readonly takeaway: NonEmptyTrimmedStringV1;
  readonly commonTrap: NonEmptyTrimmedStringV1;
}

interface ContentCanonicalChoiceLearningMetadataV3 {
  readonly choiceStableId: NonEmptyTrimmedStringV1;
  readonly relevantClaimKeys: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
}
```

`ContentCanonicalQuestionLearningMetadataV3`はcanonical question本体へ、`ContentCanonicalChoiceLearningMetadataV3`は同じ`choiceStableId`を持つcanonical choice本体へ交差させる生成型です。`takeaway`、`commonTrap`、全choiceの`relevantClaimKeys`はrelease検証専用fieldではなく学習上の意味fieldであり、private sourceからDB/API canonicalへlosslessに写像して`contentHash=SHA-256(JCS(ContentCanonicalQuestionVersionV2))`のpreimageへ含めます。`relevantClaimKeys`はchoiceごとにUTF-8 byte昇順・unique、全参照先は同版のasked claimとし、choice順自体は`choiceStableId`順に固定します。これらだけの追加、削除、値差替え、配列swapでもquestion `contentHash`、bundle `canonicalHash`、personal/public `manifestHash`が変わり、旧acceptance/attestationを再利用できません。quality gate設定の型名は全生成物でliteral `ContentQualityGateConfigV1`、schema literalは`content-quality-gate.v1`を唯一の名称とし、別名、optional化、手書き再定義を拒否します。

`takeaway`と`commonTrap`は回答確定後の学習feedbackでのみ配信・cacheするmetadataです。回答前catalog、selection basis、draft、問題表示DTO、模試提出前responseへ含めません。作問gateは両field単体または組合せが正答choice、正答数、正答位置、計算結果を推測させないことを全件検査し、手掛かりが残る候補を差戻します。suspended/revoked tombstoneは両fieldを含みません。

`ContentReviewArtifactV2`はreview typeごとのstrict unionです。全branchはschema version、canonical/blueprint/allocation/quality gateの4対象hash、review policy version、evidence hashを持ち、freeze対象とexact一致します。`machine-gate`は`system-run`と完全なmachine report hashだけ、`blind-solve`は`model-run`、正答・解説を含まないblind packet hash、提出choice集合、rationale artifact hash、提出時刻、正答開示時刻、`correctSetMatched=true`だけを許可します。blind solveは`answerKeyDisclosedAt >= submittedAt`、提出choice IDのunique・UTF-8 byte昇順、selection contractとの件数一致を要求し、提出後に独立検証した正答集合とのexact一致だけをpassとします。`personal-human`、`technical`、`editorial`、`mobile-web-preview`はhuman subjectとversion付きchecklist/result artifactだけを許可します。owner全件reviewはblind/audit/decisionを必要とするため、弱いhuman branchへ縮退させず`ContentOwnerPersonalReviewArtifactV1`だけを正本にします。`evidenceHash`はmachineでは`fullReportHash`、human checklistでは`checklistResultArtifactHash`とexact一致し、blindでは`SHA-256(JCS({blindPacketHash,submittedChoiceStableIds,rationaleArtifactHash,submittedAt,answerKeyDisclosedAt,correctSetMatched}))`です。別branchのfield、未知field、空文字・空白だけのID、placeholder IDを拒否します。

`ContentReviewArtifactV2.result`はrelease対象では`pass`だけで、未解決の`open/investigating` issueはartifactへ偽装せず`ContentReviewCoverageV2.issueRefs`へ記録します。coverageは`requiredRefs`の各tupleに必要なV2 artifactがexact一件あり、余剰artifact、重複tuple、未登録review type、`open/investigating` issueが0でなければ成立しません。V1 artifactだけではmanifestを生成できず、stage、accept、publishのいずれにも進めません。review artifactの識別子は`artifactHash`だけです。review/coverage契約に存在しない`reviewArtifactHash`または`artifactId`をDTO、manifest、hash preimage、sort keyへ追加してはなりません。なお、別契約であるcopyright detected spanの根拠を指す`ContentProvenanceV2.copyright.detectedSpans[].reviewArtifactHash`は実在fieldであり、本禁止の対象外です。

personal manifestとpublic manifestは、対象phaseで必要な`reviewCoverageHash`、`identityAssertionCoverageHash`、`accountabilityCoverageHash`、`provenanceCoverageHash`を必須fieldとして持ち、対応するcoverage artifactのcanonical bytesをlosslessに参照します。各coverageの`requiredRefs`はmanifestの対象content ref集合とreview policyから生成し、publicはpersonalを弱めず追加reviewを含む別coverageを生成します。API/DB側は本書のstrict生成型を参照し、手書き`string`や省略可能fieldへwideningしません。

全500問のAI reviewは、各問題版に対する`ContentGenerationArtifactV1` exact一件と、G0〜G12のreview artifact exact 13件を要求します。G0/G1/G3〜G11は`ContentAiEvaluationArtifactV1`、G2は`ContentAiBlindSolveArtifactV1`、G12は`ContentAiAdjudicationArtifactV1`を正本とします。G4はsingleだけ、G8は数値claimなしだけが`not-applicable`を取れ、それ以外のpassおよびrelease対象のG12は`pass`だけです。G12は同一content hashに対するG0〜G11のartifact hashをregistry順でexact 12件参照し、hard failを上書きできません。generator、G2 blind reviewer、G12 adjudicatorはprovider/model/run tupleが相互に異なり、生成runを評価runへ流用しません。各evaluation packetは一問だけを含めますが、G9のdeterministic evidenceは固定bundle全体との124,750組の比較結果から当該問題の全候補・nearest neighborを射影します。

`ContentAiReviewCoverageV1`は`expectedQuestionRefs` exact 500、`generationArtifactRefs` exact 500、`requiredPassRefs`と`reviewArtifactRefs` exact 6,500を要求します。各content ref×pass tupleはexact一件で、欠落、余剰、重複、stale artifact、未解決issueは0です。修正によりsubject/content/canonical/blueprint/allocation/quality gate/review policyのいずれかのhashが変われば、その問題版のG0〜G12を全失効し、一部passのcarry-forwardを禁止します。personal manifestは`aiReviewCoverageHash`とcoverage canonical bytesをlosslessに結合し、集計件数だけではacceptできません。

generation、G0〜G12、AI coverage、owner review/coverageの型、strict union、exact count、canonical順、hash preimageは本書だけを唯一の正本とします。API DTO、DB JSON/schema/列、validator、manifestはこの生成型から作り、手書きの同名型、optional化、enum widening、集計だけへの縮退を禁止します。private artifact→API→DB→API→独立canonicalizerを全field losslessにround-tripし、同じcanonical bytes/hashへ一致しなければpersonal manifestを作りません。

owner reviewの初期`blind`状態は正答集合、総合解説、全choice解説、takeaway、commonTrapをexact 0とします。一問のblind回答と根拠をimmutable提出した後だけその一問を`revealed`へ移し、ownerは表示を`hidden`へ戻してからaudit checklistを完了します。decisionは`pass | changes_required`のstrict unionで、後者はissue ID必須です。personal acceptanceはcurrent owner artifact exact 500、decision全件`pass`、changes_required issue 0だけを許可します。

`correctChoiceStableIds`だけを正答集合の正本とします。`ValidatedChoiceV3.classification`は保存せず、choice IDの正答集合所属からvalidatorが導出します。`isCorrect`、`is_correct`等の正答booleanはprivate source、import DTO、DBのrelease candidate行、canonical projectionのいずれにもauthorable fieldとして持たせません。正答choiceは`misconceptionCode=null`かつ`errorType='none'`、誤答choiceはその逆のstrict branchです。`distributionScope='release_candidate'`のchoiceは4〜8件、stable ID・label・`sortOrder`は各question内でunique、`sortOrder`は0始まりの連続整数です。既存互換問題は`compatibility_only`の隔離された入力・保存・配信経路だけで扱い、本schema、初回500問count、personal preview、public catalog、模試candidateへ混入させません。正答集合、premise/claim参照、reasoning step参照は重複を拒否します。

`authoredAt`はprivate sourceを確定した作成時刻であり、controlled release runnerが付与したUTC millisecond形式だけを許可します。端末の自己申告時計や後段import時刻で上書きしません。`accountableHuman`は内容の説明責任と公開前確認を示し、AI支援文を人間が単独執筆したと偽るfieldではありません。

accountability statement registryは上記literal一件だけを正本とし、`registryDigest = SHA-256(JCS({schemaVersion,statements}))`です。`statementHash = SHA-256(UTF-8(statementLiteral))`とし、versionだけの一致を許しません。accountability reviewは次の順序で固定します。

1. 最終候補の`ContentPrivateQuestionV3`から`provenance.accountableHuman.accountabilityReviewArtifactHash`だけを除き、`ContentPrivateQuestionAccountabilitySubjectV1`を構築する。
2. `subjectHash = SHA-256(RFC 8785 JCS(subject))`を計算する。
3. controlled accountability serviceが、対象の`questionStableId`、`versionStableKey`、`subjectHash`、`statementVersion`、`statementHash`へ署名対象を固定し、署名・audience・有効期限を検証したrecent-auth済みhuman assertionから`principalId`を導出する。requestやprivate bundleが自己申告するprincipal IDを信用しない。
4. content ref、subject hash、導出principal、identity assertion、review時刻、pass、statement versionを持つ`ContentAccountabilityReviewArtifactV1`を作る。
5. `accountabilityReviewArtifactHash = SHA-256(RFC 8785 JCS(artifact))`をprivate questionへ設定してraw bundleをfreezeする。

artifactはprivate review storeへcanonical bytesとともにappend-only保存します。identity assertionは`ContentIdentityAssertionArtifactV1`の`signature`だけを除いたRFC 8785 JCS UTF-8 bytesをEd25519署名したものを同じprivate storeへappend-only保存し、`assertionArtifactHash=SHA-256(JCS(assertion全field))`で参照します。nonceは暗号学的乱数32 bytes、signatureは64 bytes、trust keyのpublic keyは32 bytesをbase64url no-paddingで表し、decode長・再encode一致を検証します。issuer keyはcontrolled accountability serviceのbuild-pinned trust bundleで検証し、unknown/revoked/out-of-window keyを拒否します。artifact、assertion、subject間で`questionStableId`、`versionStableKey`、`subjectHash`、`statementVersion`、`statementHash`をexact一致させ、`identityAssertion.assertedPrincipalId === principalId === assertion.subjectPrincipalId === subject.provenance.accountableHuman.principalId`、`assertion.authenticatedAt <= assertion.issuedAt <= reviewedAt <= assertion.expiresAt`、purpose/audience/actor kind/auth methodのliteral一致を要求します。assertion ID/nonceはpurpose内一回だけconsumeし、未検証・期限切れ・別audience・別principal・machine actor・replayを拒否します。問題Aのassertionを問題Bへ、またはA/Bのsubject/artifactを入れ替えるswapはcontent refかsubject hashの不一致で必ず拒否します。同じaccountability artifact hashを複数のquestion/versionへ再利用できません。subjectの一文字、principal、assertion、result、statement、時刻を変更すれば旧artifactを拒否します。後段のraw/personal/public manifest attestation IDをsubject/artifactへ入れず、hash循環を禁止します。初回500問は500個のcontent refとaccountability artifactがexact一対一で、欠落・余剰・重複0です。

このEd25519署名はcontrolled serviceが「recent-auth済みprincipalと対象subjectを検証してassertionを発行した」ことを証明するservice assertionです。自然人が秘密鍵を保持して行う本人否認防止署名ではなく、そのように表示・監査報告しません。自然人の説明責任はrecent-auth、表示したstatement、append-only review artifactの組で証拠化します。

`model-assisted`では全runをprovider/model/digest/run IDのbyte昇順、重複なしで保存します。copyright比較前に、許諾済みまたは公開範囲内の比較対象だけを列挙した`ContentCopyrightCorpusRegistryV1`をfreezeし、そのcanonical bytesとdigestをpersonal manifestへ結合します。`perCorpusMatchCounts`はregistry entryとcorpus ID昇順でexact一対一、欠落・余剰・重複なし、全count 0を要求し、detected spanの`sourceId`も同registryへFKさせます。copyright spanの`graphemeCount`は正のsafe integerで、検出文字列そのものをsanitized manifestへ出しません。本gateが証明するのは「固定registryとの一致0」であって、世界中の全問題との一致0ではありません。これに独立human copyright reviewを重ね、公式用語以外の規範断片は全件human artifactへ結合します。

personal preview manifestはexact 500件の`ContentProvenanceV2`を、全field・nested field・配列順序を失わずstrictに保持します。64 LO literal registryから`LearningObjectiveCodeV1`とruntime schemaを一度だけ生成し、private source、API、DB、独立runnerは同じ生成物とschema digestを参照します。表示用の手動抜粋を正本にせず、未登録LOのliteral fixtureを全経路で拒否します。同名interfaceの手動再定義や配列・hash・正整数制約のwideningを禁止します。`normativeSources`とmodel-assistedの`modelRuns`はnon-empty、provider/model/run・allowlist/tokenizer/source IDはtrim後non-empty、全digest/artifact hashはlowercase SHA-256、`graphemeCount`は正のsafe integerです。fieldの省略、集約値だけへの縮退、単一model runへの縮退、空文字ID、`quotation_word_count`等の別尺度への置換を禁止します。public manifestは同一personal manifest hashを親として拘束し、provenanceを別の弱いschemaへ再入力しません。

quality gateとreview artifactで使用するtokenizer、embedding model、calibration corpus、formula registry、independent oracle runner、system/model review runnerの全digest/hashは`Sha256HexV1`です。tokenizer/model/formula/runner/corpusの全ID、provider、model ID、run IDは`NonEmptyTrimmedStringV1`です。本書から生成するAPI/DB/runtime schemaでこの制約をwideningせず、空文字、空白だけ、placeholder、64文字でないdigest、uppercase/non-hex digestを拒否します。

類似度はpersonal previewとpublicの両phaseで同じfail-closed規則を使い、固定model/corpusによるembedding類似度が`8200` basis points以上の候補を必ず差戻します。例外承認、reviewer override、別推論軸を理由にした通過経路は設けません。`qualityGateConfigHash`の`embeddingRejectBasisPoints`と`embeddingReviewBasisPoints`はいずれも`8200`へ固定し、`qualityGateConfigHash`が一致しないreport、candidate、manifestを拒否します。

### 3.2.1 補助hashの唯一の正規化契約

本節だけをallocation/corpus/review/quality/blueprint/oracle/provenance-accountability coverage等の補助hashの唯一の正本とします。API/DB文書に現れる同名の型・表・式は本節と本書の生成schemaから機械生成する表示用契約であり、独立したpreimage正本ではありません。API envelope固有のraw/content/canonical/manifest hashはAPI文書で定義できますが、ここにある補助hashを再定義できません。表で明記するraw literal `statementHash`以外の全preimage objectはRFC 8785 JCSのUTF-8 bytesです。`undefined`、非有限数、浮動小数、未登録field、Unicode正規化、暗黙のtrimを禁止し、文字列を入力bytesのcode point列のまま扱います。object key順だけをJCSへ委ね、配列順は次のliteral規則で先に固定します。

| hash / digest | exact preimage object | 除外field | 配列順 |
|---|---|---|---|
| `officialExamStructureBasisHash` | `ContentOfficialExamStructureBasisV1`の全field | `officialExamStructureBasisHash`だけ | chapterは章1→6、KはK1→K3。小数剰余が同率の場合は章番号昇順のliteral規則 |
| `allocationHash` | `ContentAllocationDefinitionV1`の全field | なし。definitionにhash/approval/actor/時刻/statusは存在しない | `officialExamStructureBasis`とそのhashをlosslessに含む。`chapterCounts`とmultiple chapterは章1→6、multiple KはK1→K3。`kLevelCounts`と`learningObjectiveCounts`はobjectでありJCS key順。別のLO配列へ変換しない |
| `blueprintHash` | `{blueprint,normativeRegistry}`。`blueprint`は`LoQuestionBlueprintV1`全field、`normativeRegistry`は`{chapters,sections,learningObjectives}`全literal | `blueprintHash`、Markdown文書SHA、承認actor/時刻/status | `blueprint.entries`とlearning objectivesは§3.3 LO registry順、chapters/sectionsは同registry順、familyは`familyId`のUTF-8 byte昇順、enum集合は本書literal registry順 |
| `qualityGateConfigHash` | `ContentQualityGateConfigV1`の全field | なし。configにhash/実行結果/reviewer/時刻は存在しない | `embeddingRejectBasisPoints`と`embeddingReviewBasisPoints`はともに8200。`patternFamilyMinimumRule`はquota 5、6〜8、9〜11、12〜500のschema記載順。その他はscalarで別配列へ変換しない |
| `registryDigest`（copyright） | `{schemaVersion,registryId,asOf,entries}` | `registryDigest` | `entries`は`corpusId`のUTF-8 byte昇順 |
| `allocationApprovalArtifactHash` | `ContentAllocationApprovalArtifactV1`の全field | なし。hashはartifact外側の参照fieldでありpreimage内に存在しない | 配列なし |
| `samplingFreezeHash` | `{canonicalHash,allocationHash,blueprintHash,qualityGateConfigHash,contentRefsWithStrata}`を`UTF8("personal-human-freeze-v1") \|\| 0x00 \|\| JCS(object)`へdomain separation | なし。hashはpreimage object外側 | `contentRefsWithStrata`はcontent ref tuple順。各elementのchapter/K/selectionはscalar field |
| sampling `populationHash` | `{samplingFreezeHash,stratum:{chapterNumber,kLevel,selectionType},contentRefs}`を`UTF8("personal-human-population-v1") \|\| 0x00 \|\| JCS(object)`へdomain separation | なし。hashはpreimage object外側 | `contentRefs`はcontent ref tuple順 |
| sampling `rankHash` | `{samplingFreezeHash,seedBase64Url,stratum:{chapterNumber,kLevel,selectionType},contentRef:{questionStableId,versionStableKey}}`を`UTF8("personal-human-rank-v1") \|\| 0x00 \|\| JCS(object)`へdomain separation | なし。hashはpreimage object外側 | 配列なし |
| `personalHumanReviewSamplingArtifactHash` | `PersonalHumanReviewSamplingArtifactV1`の全field | なし。hashはartifact外側の参照fieldでありpreimage内に存在しない | `strata`はchapter数値、K level、selection type registry順。`memberRefs`はrank hash bytes、question stable ID、version stable key順。`mandatorySelectedRefs`と`finalSelectedRefs`はcontent ref tuple順、`selectionReasons`はschema registry順 |
| review `artifactHash` | `ContentReviewArtifactV2`の選択branchに実在する全field | `artifactHash`だけ | `submittedChoiceStableIds`はchoice stable IDのUTF-8 byte昇順かつunique。他branchは配列なし。subjectとevidence branchはstrict unionで余剰field禁止 |
| `reviewCoverageHash` | `ContentReviewCoverageV2`の全field | `reviewCoverageHash`だけ | `requiredRefs`はreview type registry順、content ref tuple順。`artifactRefs`はreview type、content ref tuple、subject type registry順、subject実在値（human=`principalId` UUID bytes、system=`runnerId` UTF-8/`runnerDigest` bytes/`runId` UTF-8、model=`provider`/`modelId` UTF-8/`modelDigest` bytes/`runId` UTF-8）、`artifactHash` bytes順。`issueRefs`はcontent ref tuple、`issueId` UUID bytes順。重複拒否 |
| generation `artifactHash` | `ContentGenerationArtifactV1`の全field | `artifactHash`だけ | 配列なし。generatorはmodel-run strict branch |
| AI evaluation `artifactHash` | `ContentAiEvaluationArtifactV1`の全field | `artifactHash`だけ | `passId`はG0、G1、G3〜G11のregistry順。outcomeはstrict unionで余剰field禁止 |
| AI blind `artifactHash` | `ContentAiBlindSolveArtifactV1`の全field | `artifactHash`だけ | `submittedChoiceStableIds`はchoice stable IDのUTF-8 byte昇順かつunique |
| AI adjudication `artifactHash` | `ContentAiAdjudicationArtifactV1`の全field | `artifactHash`だけ | `prerequisiteArtifactHashes`はG0〜G11順のexact 12件、重複拒否 |
| `aiReviewCoverageHash` | `ContentAiReviewCoverageV1`の全field | `aiReviewCoverageHash`だけ | `expectedQuestionRefs`と`generationArtifactRefs`はcontent ref tuple順。`requiredPassRefs`と`reviewArtifactRefs`はpass registry順、content ref tuple順。stale/issueはcontent ref tuple、pass/issue ID順。重複拒否 |
| owner personal review `artifactHash` | `ContentOwnerPersonalReviewArtifactV1`の全field | `artifactHash`だけ | blind提出choiceはstable ID UTF-8 byte昇順かつunique、reveal transitionは`blind/revealed/hidden/audit-completed` exact順。outcomeはstrict union |
| `ownerPersonalReviewCoverageHash` | `ContentOwnerPersonalReviewCoverageV1`の全field | `ownerPersonalReviewCoverageHash`だけ | expected/current refsはcontent ref tuple順、changes_required issueはcontent ref tuple・issue ID順。重複拒否 |
| `numericOracleVerificationArtifactHash` | `NumericOracleVerificationArtifactV1`の全field。各entryはcontent ref、claim key、formula ID、scalar/rational/rational-list inputs、中間値、丸めmode/scale、scalar/ordered-setのexpected/oracle値、unit、全choice bindingをlosslessに持つ | `numericOracleVerificationArtifactHash`だけ | entriesは`questionStableId`,`versionStableKey`,`claimKey`のUTF-8 byte昇順かつtuple unique。inputsはrecord keyのJCS順、中間値は`key`、choice bindingは`choiceStableId`のUTF-8 byte昇順かつunique。ordered-set/rational-listはschemaが定める順序を保持する |
| `assertionArtifactHash` | `ContentIdentityAssertionArtifactV1`の全field | なし。hashはidentity assertion外側の参照fieldでありpreimage内に存在しない | 配列なし。`signature`を含む |
| identity assertion Ed25519署名対象 | `ContentIdentityAssertionArtifactV1`の全field | `signature`だけ | 配列なし。RFC 8785 JCS UTF-8 bytesを署名し、`assertionArtifactHash`は署名を含む全fieldから別計算 |
| `subjectHash` | `ContentPrivateQuestionAccountabilitySubjectV1`の全field | `provenance.accountableHuman.accountabilityReviewArtifactHash`だけ（subject型にこのfieldは存在しない）。contentの他fieldは全て含む | private question内の各配列は各schemaのcanonical順。正答集合はchoice stable ID UTF-8 byte順、reasoning stepsは数値step順、provenanceは`provenanceCanonicalHash`行のnested順 |
| `statementHash` | `ContentAccountabilityStatementRegistryV1.statements[0].statementLiteral`のUTF-8 bytesそのもの | version、registry metadata、digest | 配列なし。この行だけはJCS objectで包まない |
| `registryDigest`（accountability statement） | `{schemaVersion,statements}` | `registryDigest` | `statements`はstatement version registry順 |
| `accountabilityReviewArtifactHash` | `ContentAccountabilityReviewArtifactV1`の全field | なし。hashはaccountability artifact外側の参照fieldでありpreimage内に存在しない | 配列なし |
| `provenanceCanonicalHash` | `ContentProvenanceCanonicalArtifactV1`の全field | `provenanceCanonicalHash`だけ | `normativeSources`はsource ID、chapter code、section code、LO codeのUTF-8 byte順。`modelRuns`はprovider、model ID、model digest、run ID順。`perCorpusMatchCounts`はcorpus ID順、`detectedSpans`はsource ID、classification、grapheme count、review artifact hash順。各tuple unique |
| `identityAssertionCoverageHash` | `ContentIdentityAssertionCoverageV1`の全field | `identityAssertionCoverageHash`だけ | `requiredRefs`はcontent ref tuple順。`artifactRefs`はcontent ref tuple、`assertionArtifactHash`順。exact一対一、重複拒否 |
| `accountabilityCoverageHash` | `ContentAccountabilityCoverageV1`の全field | `accountabilityCoverageHash`だけ | `requiredRefs`はcontent ref tuple順。`artifactRefs`はcontent ref tuple、`accountabilityReviewArtifactHash`順。exact一対一、重複拒否 |
| `provenanceCoverageHash` | `ContentProvenanceCoverageV1`の全field | `provenanceCoverageHash`だけ | `requiredRefs`はcontent ref tuple順。`artifactRefs`はcontent ref tuple、`provenanceCanonicalHash`順。exact一対一、重複拒否 |

`copyrightCorpusRegistryHash`は上表の`registryDigest`とbyte-for-byte同値とし、別preimageによる二重hashを作りません。statement registry digestは`{schemaVersion,statements}`、formula/LO/chapter/section registry digestも「schemaVersionと全literal entry」だけをpreimageとし、digest自身、Markdownの空白・見出し・表罫線を含めません。manifest outer hashは対応manifest schemaが定義する全fieldから`manifestHash`だけを除いたJCSであり、ここに列挙した補助hashのpreimageを再構築して置換しません。

各実装は実装関数からexpectedを生成しないliteral golden fixtureを共有します。fixtureは入力JSONだけでなく、手作業で固定したexact JCS bytes、UTF-8 hex、lowercase SHA-256を定数として持ちます。最小の肯定goldenは`allocationApprovalArtifactHash`を対象とし、review V2についても6 branch各一件のexact JCS/UTF-8 hex/SHA-256とreview coverage一件を固定します。exact JCS bytesを次の一行へ固定します（末尾改行なし）。

```text
{"allocationHash":"0000000000000000000000000000000000000000000000000000000000000000","approvedAt":"2026-08-13T00:00:00.000Z","approvedBy":"00000000-0000-4000-8000-000000000001","decision":"owner_approved","ownerDecisionReference":"D-04","schemaVersion":"content-allocation-approval-artifact.v1","sourceDesignDocumentHash":"1111111111111111111111111111111111111111111111111111111111111111"}
```

UTF-8 hexは次の一行です。

```text
7b22616c6c6f636174696f6e48617368223a2230303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030222c22617070726f7665644174223a22323032362d30382d31335430303a30303a30302e3030305a222c22617070726f7665644279223a2230303030303030302d303030302d343030302d383030302d303030303030303030303031222c226465636973696f6e223a226f776e65725f617070726f766564222c226f776e65724465636973696f6e5265666572656e6365223a22442d3034222c22736368656d6156657273696f6e223a22636f6e74656e742d616c6c6f636174696f6e2d617070726f76616c2d61727469666163742e7631222c22736f7572636544657369676e446f63756d656e7448617368223a2231313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131227d
```

SHA-256は`036cfb234ed8a0430d3a326467ba47d17e2e91e2acf7ae9cfccce938ffafbd30`です。最低fixture集合はさらに、上表の全補助hash、自己hash field除外、nested配列順の一箇所swap、1 bit変更、Unicode合成済み/未合成文字、未知field、重複ref、空・空白ID、review subject/evidence branchの余剰field、V1 reviewしかないcoverage、4対象hashの一つの不一致、blind packetへの正答混入、`answerKeyDisclosedAt < submittedAt`、提出choiceの重複・未sort・件数不一致、`correctSetMatched=false`、machine full report欠落、human checklist version/result欠落、numeric oracle entries空配列を含み、TS、SQL、独立runnerの3者で同じbytes/hashまたは同じ拒否理由へ一致させます。review/coverage schemaに存在しない`reviewArtifactHash`や`artifactId`をhash、sort、coverageへ導入してはなりません。

### 3.2.2 personal human review抽出

K1/K2の層化20%抽出seedをcontent hash、canonical hash、問題本文、正答、時刻のhashから導出してはなりません。候補500件とstratum所属をfreezeした後、release runnerから権限分離したcontrolled sampling serviceがCSPRNG 32 bytesを一度だけ発行します。`samplingFreezeHash = SHA-256(UTF8("personal-human-freeze-v1") || 0x00 || JCS({canonicalHash,allocationHash,blueprintHash,qualityGateConfigHash,contentRefsWithStrata}))`とし、`contentRefsWithStrata`はcontent ref tupleのUTF-8 byte昇順、各要素はchapter number、K level、selection typeを持ち、raw/provenance-only fieldを含めません。serviceは`PersonalHumanReviewSamplingArtifactV1`の`signature`だけを除く全fieldをRFC 8785 JCSでEd25519署名します。artifact canonical bytesとhashをappend-only private storeへ保存し、personal manifestはartifact全fieldとartifact hash、`canonicalHash`、`blueprintHash`、`allocationHash`、`qualityGateConfigHash`、`samplingFreezeHash`をlosslessに結合します。DBは`(samplingFreezeHash,schemaVersion)`をUNIQUEにし、同じfreezeへの再発行・seed更新・seed候補選別を拒否します。発行失敗はartifact未保存の時だけ同じ発行処理を再試行でき、署名済みartifactを保存した後は取消・失敗を理由にseedを引き直せません。問題・allocation・blueprint・quality gateの変更時は新freezeと新artifactを要求します。

K1/K2各chapter/K/selection stratum内の順位は、各content refについて`SHA-256(UTF8("personal-human-rank-v1") || 0x00 || JCS({samplingFreezeHash,seedBase64Url,stratum:{chapterNumber,kLevel,selectionType},contentRef:{questionStableId,versionStableKey}}))`を計算し、digest bytes、`questionStableId`、`versionStableKey`の順で昇順とします。stratumごとに`quota = ceil(populationCount / 5)`を先頭から選びます。`populationHash = SHA-256(UTF8("personal-human-population-v1") || 0x00 || JCS({samplingFreezeHash,stratum:{chapterNumber,kLevel,selectionType},contentRefs}))`で、refsはcontent ref tuple昇順です。`strata`はchapter数値、K level、selection type registry順、`memberRefs`はrank hash bytesとcontent refのtie-break順、`cutoffRankHash`はquota番目のrank、`mandatorySelectedRefs`と`finalSelectedRefs`はcontent ref tupleのUTF-8 byte昇順とします。全K3・全multiple・全blind disagreement・同bundle lineageのcarry-forwardを`mandatorySelectedRefs`へ理由のregistry順で保存し、stratum sampleとの集合和を`finalSelectedRefs`とします。同じrefが複数理由へ該当しても各配列内のrefは一件だけです。seedを含むrank preimage、stratum membership、全rank、cutoff、sample選択、必須選択理由、最終集合を署名済みartifactへ保存し、レビュー結果と別に監査可能にします。content raw/canonical hashをseedに使う方式、JCSなしの文字列連結、domain separatorなし、選定後のseed再発行を拒否します。NULエスケープを含む文字列literalやdelimiter連結を同じbyte表現の代替として認めません。

### 3.3 規範chapter・section・LO registry

次の表は表示用の独自日本語要約を含むliteral registryです。公式シラバス本文の転載ではありません。code、親code、titleの全値をblueprint hashへ含め、問題側の自由入力titleを受理しません。

```ts
interface NormativeChapterV1 {
  readonly chapterCode: '1' | '2' | '3' | '4' | '5' | '6';
  readonly chapterNumber: ChapterNumberV1;
  readonly title: string;
}

interface NormativeSectionV1 {
  readonly sectionCode: string;
  readonly chapterCode: NormativeChapterV1['chapterCode'];
  readonly title: string;
}

interface NormativeLearningObjectiveV1 {
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly sectionCode: string;
  readonly kLevel: KLevelV1;
  readonly title: string;
}
```

| chapterCode | title |
|---|---|
| 1 | テストの基礎 |
| 2 | ソフトウェア開発ライフサイクル全体のテスト |
| 3 | 静的テスト |
| 4 | テスト分析と設計 |
| 5 | テスト活動のマネジメント |
| 6 | テストツール |

| sectionCode | chapterCode | title |
|---|---:|---|
| 1.1 | 1 | テストとは何か |
| 1.2 | 1 | テストが必要な理由 |
| 1.3 | 1 | テストの原則 |
| 1.4 | 1 | テスト活動・テストウェア・役割 |
| 1.5 | 1 | 必須スキルとグッドプラクティス |
| 2.1 | 2 | SDLCにおけるテスト |
| 2.2 | 2 | テストレベルとテストタイプ |
| 2.3 | 2 | 保守テスト |
| 3.1 | 3 | 静的テストの基本 |
| 3.2 | 3 | フィードバックとレビュープロセス |
| 4.1 | 4 | テスト技法の概要 |
| 4.2 | 4 | ブラックボックステスト技法 |
| 4.3 | 4 | ホワイトボックステスト技法 |
| 4.4 | 4 | 経験ベースのテスト技法 |
| 4.5 | 4 | コラボレーションベースのテストアプローチ |
| 5.1 | 5 | テスト計画 |
| 5.2 | 5 | リスクマネジメント |
| 5.3 | 5 | テストのモニタリング・コントロール・完了 |
| 5.4 | 5 | 構成管理 |
| 5.5 | 5 | 欠陥マネジメント |
| 6.1 | 6 | テストを支援するツール |
| 6.2 | 6 | テスト自動化の利点とリスク |

| LO | section | K | 独自日本語title |
|---|---|---:|---|
| 1.1.1 | 1.1 | K1 | テストの代表的な目的を識別する |
| 1.1.2 | 1.1 | K2 | テストとデバッグを区別する |
| 1.2.1 | 1.2 | K2 | テストが必要な理由を具体例で説明する |
| 1.2.2 | 1.2 | K1 | テストと品質保証の関係を識別する |
| 1.2.3 | 1.2 | K2 | 根本原因・エラー・欠陥・故障を区別する |
| 1.3.1 | 1.3 | K2 | テストの原則を状況へ関連付ける |
| 1.4.1 | 1.4 | K2 | テスト活動とタスクを区分する |
| 1.4.2 | 1.4 | K2 | コンテキストがテストプロセスへ与える影響を説明する |
| 1.4.3 | 1.4 | K2 | テスト活動とテストウェアを対応付ける |
| 1.4.4 | 1.4 | K2 | トレーサビリティの価値を説明する |
| 1.4.5 | 1.4 | K2 | テストマネジメントとテスト担当の役割を比較する |
| 1.5.1 | 1.5 | K2 | テストに必要な一般スキルを説明する |
| 1.5.2 | 1.5 | K1 | チーム全体アプローチの利点を識別する |
| 1.5.3 | 1.5 | K2 | テストの独立性の利点と欠点を比較する |
| 2.1.1 | 2.1 | K2 | SDLCがテストへ与える影響を説明する |
| 2.1.2 | 2.1 | K1 | SDLCを問わないグッドプラクティスを識別する |
| 2.1.3 | 2.1 | K1 | テストファーストアプローチを識別する |
| 2.1.4 | 2.1 | K2 | DevOpsがテストへ与える影響を説明する |
| 2.1.5 | 2.1 | K2 | シフトレフトを説明する |
| 2.1.6 | 2.1 | K2 | レトロスペクティブによる改善を説明する |
| 2.2.1 | 2.2 | K2 | テストレベルを目的と対象で区別する |
| 2.2.2 | 2.2 | K2 | テストタイプを区別する |
| 2.2.3 | 2.2 | K2 | 確認テストとリグレッションテストを区別する |
| 2.3.1 | 2.3 | K2 | 保守テストの契機と範囲を選択する |
| 3.1.1 | 3.1 | K1 | 静的テストで検査できる成果物を識別する |
| 3.1.2 | 3.1 | K2 | 静的テストの価値を説明する |
| 3.1.3 | 3.1 | K2 | 静的テストと動的テストを比較する |
| 3.2.1 | 3.2 | K1 | 早期かつ頻繁なステークホルダーフィードバックの利点を識別する |
| 3.2.2 | 3.2 | K2 | レビュープロセスの活動を説明する |
| 3.2.3 | 3.2 | K1 | レビューの主要な役割と責務を識別する |
| 3.2.4 | 3.2 | K2 | レビュータイプを比較する |
| 3.2.5 | 3.2 | K1 | レビュー成功要因を識別する |
| 4.1.1 | 4.1 | K2 | テスト技法の種類を区別する |
| 4.2.1 | 4.2 | K3 | 同値分割法を適用する |
| 4.2.2 | 4.2 | K3 | 境界値分析を適用する |
| 4.2.3 | 4.2 | K3 | デシジョンテーブルテストを適用する |
| 4.2.4 | 4.2 | K3 | 状態遷移テストを適用する |
| 4.3.1 | 4.3 | K2 | ステートメントテストを説明する |
| 4.3.2 | 4.3 | K2 | ブランチテストを説明する |
| 4.3.3 | 4.3 | K2 | ホワイトボックステストの価値を説明する |
| 4.4.1 | 4.4 | K2 | エラー推測を説明する |
| 4.4.2 | 4.4 | K2 | 探索的テストを説明する |
| 4.4.3 | 4.4 | K2 | チェックリストベースドテストを説明する |
| 4.5.1 | 4.5 | K2 | ユーザーストーリー作成への協働を説明する |
| 4.5.2 | 4.5 | K2 | 受け入れ基準を分類する |
| 4.5.3 | 4.5 | K3 | ATDDでテストケースを導出する |
| 5.1.1 | 5.1 | K2 | テスト計画の目的と内容を説明する |
| 5.1.2 | 5.1 | K1 | 計画へのテスト担当者の貢献を識別する |
| 5.1.3 | 5.1 | K2 | 開始基準と終了基準を区別する |
| 5.1.4 | 5.1 | K3 | 見積り技法で工数を計算する |
| 5.1.5 | 5.1 | K3 | テストケースを優先順位付けする |
| 5.1.6 | 5.1 | K1 | テストピラミッドを識別する |
| 5.1.7 | 5.1 | K2 | テスト四象限を分類する |
| 5.2.1 | 5.2 | K1 | 可能性と影響からリスクレベルを識別する |
| 5.2.2 | 5.2 | K2 | プロジェクトリスクとプロダクトリスクを区別する |
| 5.2.3 | 5.2 | K2 | プロダクトリスク分析がテストへ与える影響を説明する |
| 5.2.4 | 5.2 | K2 | プロダクトリスクへの対応を選択する |
| 5.3.1 | 5.3 | K1 | テストで利用するメトリクスを識別する |
| 5.3.2 | 5.3 | K2 | テストレポートを目的と読み手で比較する |
| 5.3.3 | 5.3 | K2 | テスト状況の伝達手段を選択する |
| 5.4.1 | 5.4 | K2 | 構成管理がテストを支える理由を説明する |
| 5.5.1 | 5.5 | K3 | 欠陥レポートを作成する |
| 6.1.1 | 6.1 | K2 | ツール支援をテスト活動へ対応付ける |
| 6.2.1 | 6.2 | K1 | テスト自動化の利点とリスクを識別する |

## 4. LO別blueprint

次の64行が`LoQuestionBlueprintV1.entries`の正本literal registryです。Markdown parserは列名と次の文法を固定し、自由文の意味を推測しません。

- pattern familyは`; `で分割し、左から`<LO code>:pf01`、`pf02`…を付け、tokenを`name`のexact literalとします。`discriminatingReasoning`は`<token>について、<entry operationsの表記順>を用いて、<evidence cell>からasked claimの判断へ到達する`というexact文字列へ展開します。独立reviewで二つのfamilyが同じ入力・操作・判断対象になる場合は別familyとして数えず差し戻します。
- 代表的誤概念は`; `で分割し、左から`<LO code>:mc01`、`mc02`…を付けます。tokenは表示用説明、生成されたcodeが問題側参照値です。
- evidence cellは`mode[fact-code,... / artifact-code,...]`です。`none[- / -]`、`at-least-one[...]`、`both[...]`だけを許し、codeは§2.3 enum exactです。
- 追加禁止cellは`ForbiddenRuleCodeV1`の`,`区切りです。全LO共通codeとの和集合をentryへ格納します。
- 認知操作、追加禁止、evidence kind、oracleはenum literal exactです。`allowedQuestionForms`は§2.2のliteral mapから集合和を取り、byte昇順へ正規化します。
- 表の行順、列順、区切り、token、生成IDを含むliteral fixtureをblueprint hashへ結合します。validator自身が入力値からexpected registryを自己生成する自己証明を禁止し、別実装の固定fixtureと全値照合します。

### 4.1 第1章（exact 100）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 1.1.1 | 9 / K1 | recognize, map-artifact | 目的の識別; 目的と活動の対応; 目的と成果物の対応; 目的とstakeholder価値; 非目的の排除 | none[- / -] | 欠陥皆無証明; debugging同一視; 品質保証全体との混同 | keyword-only,terminology-conflation | none |
| 1.1.2 | 7 / K2 | distinguish, classify | failure観測後の切分け; defect修正前後; tester/developerの責務; confirmationとの境界 | at-least-one[observed-outcome,actor-role,sequence / log,change-record] | testingが修正する; debuggingが独立評価する; 原因特定前に再テスト | name-or-title-only,terminology-conflation | none |
| 1.2.1 | 7 / K2 | explain-causal, select-with-justification | 早期欠陥検出の便益; 契約/法令リスク; 利用者損失; 意思決定情報 | at-least-one[timing,scope,audience,cost-or-effort,risk / risk-record] | テスト費用だけ増加; 実行件数=品質; 欠陥0=十分 | context-free-generalization,unsupported-number | conditional |
| 1.2.2 | 8 / K1 | recognize, map-artifact | testingとQAの焦点; product/process対応; 予防/検出の対応; 組織活動の識別 | none[- / -] | testing=QA全体; QA=実行テスト; 品質はtesterのみの責任 | name-or-title-only,terminology-conflation | none |
| 1.2.3 | 7 / K2 | classify, explain-causal | root cause→error; error→defect; defect→failure; failureなしdefect | at-least-one[activity,artifact-state,observed-outcome,sequence / work-product,log] | defectとfailure同一; 全defectが必ずfailure; root cause=表面症状 | keyword-only,terminology-conflation | none |
| 1.3.1 | 7 / K2 | explain-causal, select-with-justification | exhaustive不可能; defect clustering; pesticide paradox; context依存 | at-least-one[constraint,history,change,coverage / report] | 全入力実行が常に可能; 同一test反復で十分; 原則が手順を指定 | keyword-only,unsupported-absolute | conditional |
| 1.4.1 | 7 / K2 | classify, map-artifact | planning/monitoring; analysis/design; implementation/execution; completion | at-least-one[activity,timing,scope / work-product,plan,log,report] | activity順序は固定一回; analysis=execution; completion=欠陥修正 | keyword-only,terminology-conflation | none |
| 1.4.2 | 7 / K2 | compare, explain-causal | safety critical vs low risk; sequential vs iterative; time/budget制約; skill/tool制約 | at-least-one[risk,lifecycle,constraint,environment / lifecycle-model] | 全project同一process; toolでcontext差消滅; 規制は品質に無関係 | single-factor-decision,unsupported-absolute | none |
| 1.4.3 | 7 / K2 | map-artifact, classify | plan系work product; design系; execution log系; completion/report系 | at-least-one[activity,scope / plan,test-design,log,report] | test case=plan; log=summary; requirement=testing専有物 | keyword-only,name-or-title-only | none |
| 1.4.4 | 7 / K2 | explain-causal, select-with-justification | requirement→test; defect→test; coverage影響; change impact | at-least-one[change,coverage,dependency / trace-matrix] | traceability=文書量; linkは実行後不要; 双方向でなくても影響分析可能 | unsupported-number,missing-required-evidence | conditional |
| 1.4.5 | 7 / K2 | distinguish, classify | management role; testing role; shared responsibility; 小規模兼務 | at-least-one[actor-role,activity,dependency / role-matrix] | testerが全管理; managerが全実行; role=job title固定 | name-or-title-only,terminology-conflation | none |
| 1.5.1 | 6 / K2 | classify, select-with-justification | curiosity/critical thinking; communication; domain knowledge; technical skill | at-least-one[actor-role,communication-need,constraint / review-record] | tool skillだけで十分; 対立回避=問題非報告; domain knowledge不要 | context-free-generalization,single-factor-decision | none |
| 1.5.2 | 8 / K1 | recognize, map-artifact | whole-teamの定義; 早期協働; skill共有; 制約/例外 | none[- / -] | tester不要化; 全員が全role担当; 独立性を常に禁止 | keyword-only,unsupported-absolute | none |
| 1.5.3 | 6 / K2 | compare, explain-causal | 独立性の利点; communication drawback; level比較; context別選択 | at-least-one[actor-role,risk,communication-need / role-matrix] | 最大独立が常に最善; 独立testerは協働不可; developer testは無価値 | single-factor-decision,unsupported-absolute | none |

### 4.2 第2章（exact 75）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 2.1.1 | 7 / K2 | compare, explain-causal | sequentialでの早期関与; iterative feedback; incremental regression; lifecycle変更時の適応 | at-least-one[lifecycle,timing,change / lifecycle-model] | lifecycleでテスト原則が変わる; iterativeは計画不要; sequentialは早期test不可 | name-or-title-only,unsupported-absolute | none |
| 2.1.2 | 10 / K1 | recognize, map-artifact | activity対応; level対応; objective対応; trace対応; early involvement | none[- / -] | development完了後のみ; 各level目的同一; test活動は独立孤立 | context-free-generalization,unsupported-absolute | none |
| 2.1.3 | 10 / K1 | recognize, map-artifact | TDD識別; ATDD識別; BDD識別; example-first; test-first成果物 | none[- / -] | 三手法同一; test-first=実行を先にするだけ; acceptance criteria不要 | product-knowledge-dependency,terminology-conflation | none |
| 2.1.4 | 7 / K2 | explain-causal, compare | pipeline feedback; automation benefits; shared responsibility; operational feedback/risk | at-least-one[timing,risk,actor-role,observed-outcome / pipeline] | DevOpsで手動test不要; speed優先で品質gate不要; productionだけでtest | product-knowledge-dependency,single-factor-decision | conditional |
| 2.1.5 | 7 / K2 | classify, select-with-justification | reviewによるshift-left; static analysis; testability/design; early test design | at-least-one[timing,artifact-state,activity / work-product,plan] | 全dynamic testを前倒し; production test禁止; 早期ほど常に安価と断定 | missing-required-evidence,unsupported-absolute | none |
| 2.1.6 | 7 / K2 | explain-causal, select-with-justification | retrospective input; 改善action; follow-up; blame-free learning | at-least-one[history,observed-outcome,actor-role / review-record] | 感想会のみ; action owner不要; 個人査定目的 | unsupported-number,privacy-or-hostile-content | none |
| 2.2.1 | 7 / K2 | distinguish, classify | component; component integration; system; acceptance | at-least-one[scope,actor-role,activity / architecture-model,requirement-excerpt] | level=環境名; integration=E2Eのみ; acceptance=欠陥検出だけ | name-or-title-only,single-factor-decision | none |
| 2.2.2 | 7 / K2 | distinguish, classify | functional; non-functional; black-box; change-related | at-least-one[quality-characteristic,scope,activity / requirement-excerpt] | non-functional=性能だけ; black-box=functional同義; type=level | keyword-only,terminology-conflation | none |
| 2.2.3 | 7 / K2 | distinguish, explain-causal | confirmation対象; regression範囲; 両方必要; automation選定 | at-least-one[change,scope,dependency / change-record,test-design] | confirmationだけで十分; regressionは同じ欠陥だけ; 全件再実行必須 | missing-required-evidence,unsupported-absolute | conditional |
| 2.3.1 | 6 / K2 | classify, select-with-justification | defect fix保守; enhancement; migration; retirement | at-least-one[change,risk,scope / change-record,risk-record] | 保守test=障害修正だけ; migrationは機能test不要; retirementはtest不要 | terminology-conflation,context-free-generalization | none |

### 4.3 第3章（exact 50）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 3.1.1 | 7 / K1 | recognize, map-artifact | review識別; static analysis識別; walkthrough例; tool検査例 | none[- / -] | 実行必須; compiler testだけ; review=管理承認 | terminology-conflation,keyword-only | none |
| 3.1.2 | 7 / K2 | explain-causal, compare | 早期検出; dynamic困難欠陥; work product改善; cost/communication | at-least-one[timing,artifact-state,observed-outcome,cost-or-effort / review-record] | staticでfailure観測; 全defect検出; dynamic不要化 | unsupported-number,unsupported-absolute | conditional |
| 3.1.3 | 6 / K2 | compare, distinguish | 実行有無; 発見対象; 利用work product; 相互補完 | at-least-one[activity,observed-outcome,artifact-state / work-product,report] | staticとdynamic排他; 同じ欠陥集合; staticはcode限定 | context-free-generalization,terminology-conflation | none |
| 3.2.1 | 6 / K1 | recognize, map-artifact | early feedback benefit; frequent feedback benefit; stakeholder alignment; ambiguity/rework reduction | none[- / -] | feedback=欠陥一覧送付のみ; 遅いほど正確; 一方向通知で十分 | context-free-generalization,unsupported-absolute | none |
| 3.2.2 | 6 / K2 | classify, map-artifact, explain-causal | planning; review initiation; individual review; communication/analysis; fixing/reporting | both[activity,sequence,actor-role / plan,review-record] | 全reviewで会議必須; fixingはreviewer; planning不要 | terminology-conflation,missing-required-evidence | none |
| 3.2.3 | 6 / K1 | recognize, map-artifact | manager responsibility; author responsibility; moderator responsibility; reviewer responsibility; scribe responsibility | none[- / -] | authorが全role兼務; reviewerが修正責任を負う; 役職名だけで責務が決まる | name-or-title-only,terminology-conflation | none |
| 3.2.4 | 6 / K2 | compare, classify | informal review; walkthrough; technical review; inspection | at-least-one[actor-role,activity,scope / review-charter] | walkthrough=inspection; formalほど常に最適; author不参加が必須 | name-or-title-only,unsupported-absolute | none |
| 3.2.5 | 6 / K1 | recognize, map-artifact | objective/criteria; small chunks; training/time; management support | none[- / -] | metricを罰に使用; 大量一括が効率的; follow-up不要 | single-factor-decision,privacy-or-hostile-content | none |

### 4.4 第4章（exact 138）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 4.1.1 | 8 / K2 | distinguish, classify | black-box; white-box; experience-based; three-family comparison | at-least-one[activity,scope,history / test-design] | technique=level; black-boxは手動のみ; experience-basedは根拠不要 | product-knowledge-dependency,terminology-conflation | none |
| 4.2.1 | 12 / K3 | apply-technique, construct, calculate | 連続範囲partition; categorical集合; 複数制約のintersection; invalid partition; partition定義欠陥; representative選定 | both[input-domain,business-rule,constraint / partition-table] | 境界値だけ選ぶ; partition重複/欠落; invalid class除外 | scenario-label-derivative,missing-required-evidence | conditional |
| 4.2.2 | 12 / K3 | apply-technique, calculate, construct | 2-value BVA; 3-value BVA; 複数境界; 非対称境界; open/closed端点; 既存caseのcoverage欠陥 | both[input-domain,business-rule,constraint / boundary-table] | nominalだけ; 境界そのものを除外; EPと同一扱い | missing-required-evidence,unsupported-number | required |
| 4.2.3 | 12 / K3 | apply-technique, construct, calculate | full decision table; limited-entry; impossible combination; rule compression; coverage欠落; action conflict | both[business-rule,constraint / decision-table] | 1条件1case; impossible ruleも実行; action列無視 | missing-required-evidence,unsupported-number | conditional |
| 4.2.4 | 12 / K3 | apply-technique, construct, calculate | valid transition; invalid transition; state coverage; transition coverage; event sequence; model defect発見 | both[sequence,business-rule,constraint / state-model] | 状態だけで十分; invalid transition対象外; event順序無関係 | missing-required-evidence,context-free-generalization | conditional |
| 4.3.1 | 9 / K2 | explain-causal, interpret-evidence, classify | statement識別; coverage算出; uncovered statement; 100%限界; test追加効果 | both[control-flow,execution-trace,coverage / code-or-control-flow,coverage-report] | 100%=正しさ; branchも100%; 重複実行でcoverage増 | missing-required-evidence,unsupported-number | conditional |
| 4.3.2 | 9 / K2 | explain-causal, interpret-evidence, classify | branch識別; coverage算出; uncovered outcome; statementとの関係; compound decision限界 | both[control-flow,execution-trace,coverage / code-or-control-flow,coverage-report] | branch=if文数; statement100ならbranch100; exception branch無視 | missing-required-evidence,unsupported-number | conditional |
| 4.3.3 | 9 / K2 | compare, explain-causal, select-with-justification | hidden structure発見; coverage gap; black-box補完; adequacy限界; maintainability trade-off | at-least-one[control-flow,coverage,risk / coverage-report,requirement-excerpt] | white-boxだけで十分; coverage高=欠陥なし; 内部知識は常に禁止 | single-factor-decision,unsupported-absolute | conditional |
| 4.4.1 | 9 / K2 | classify, select-with-justification | 類似欠陥履歴; error-prone input; integration assumption; resource/timeout; heuristic更新 | at-least-one[history,input-domain,dependency,constraint / defect-history,architecture-model] | 無作為推測; 根拠不要; 再現不能でよい | context-free-generalization,missing-required-evidence | none |
| 4.4.2 | 9 / K2 | explain-causal, classify, compare | charter; time-box; learning/design/execution; session notes; 適合状況 | both[scope,timing,risk / test-charter,log] | ad hoc同義; 記録不要; 事前知識禁止 | terminology-conflation,missing-required-evidence | conditional |
| 4.4.3 | 9 / K2 | classify, select-with-justification, compare | checklist作成; 適用; 更新; 粒度; 再利用限界 | both[risk,quality-characteristic,history / checklist] | detailed test case同一; checklist不変; 項目多いほど良い | context-free-generalization,unsupported-absolute | none |
| 4.5.1 | 9 / K2 | explain-causal, classify, select-with-justification | 3C; collaborative workshop; perspective共有; story分割; testability改善 | at-least-one[audience,artifact-state,communication-need / user-story] | POだけで完成; conversation不要; acceptance criteriaはtester単独 | name-or-title-only,single-factor-decision | none |
| 4.5.2 | 9 / K2 | distinguish, classify, compare | scenario-oriented; rule-oriented; positive/negative; testable/not-testable; ambiguity修正 | both[business-rule,expected-actual / criterion-set] | criteria=implementation手順; 曖昧形容詞で十分; positiveだけ | keyword-only,missing-required-evidence | none |
| 4.5.3 | 10 / K3 | apply-technique, construct, calculate | given-when-then; rule tableからcase; negative example; boundary example; criteria gap検出 | both[business-rule,expected-actual,input-domain / user-story,criterion-set] | acceptance後に設計; happy pathだけ; example=要件の完全代替 | scenario-label-derivative,missing-required-evidence | conditional |

### 4.5 第5章（exact 112）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 5.1.1 | 6 / K2 | classify, map-artifact, explain-causal | scope/objective; resources/schedule; approach/risks; entry/exit | both[scope,constraint,risk / plan] | plan=日程だけ; 一度作れば不変; test case詳細を全包含 | keyword-only,terminology-conflation | none |
| 5.1.2 | 5 / K1 | recognize, map-artifact | iteration planning; release planning; risk input; effort input; definition-of-done input | none[- / -] | testerは実行時だけ; estimateはmanager専有; release planning不要 | name-or-title-only,unsupported-absolute | none |
| 5.1.3 | 6 / K2 | distinguish, classify | entry criterion; exit criterion; readiness evidence; completion evidence | both[timing,dependency,coverage,artifact-state / criterion-set] | entry=開始日; exit=欠陥0のみ; criteriaは一度も見直さない | single-factor-decision,unsupported-absolute | conditional |
| 5.1.4 | 14 / K3 | calculate, apply-technique, construct | ratios-based estimate; extrapolation; three-point estimate; team estimation; historical adjustment; uncertainty comparison | both[scope,history,cost-or-effort,constraint / estimate-sheet] | 単一点が確実; 単位混在; historical context差無視 | missing-required-evidence,unsupported-number | required |
| 5.1.5 | 14 / K3 | apply-technique, calculate, construct | risk-based順位; coverage-based順位; requirement priority; dependency order; regression value; conflicting constraints | both[risk,priority,dependency,cost-or-effort / backlog] | 実行順=作成順; 高priorityだけ実行; dependency無視 | missing-required-evidence,single-factor-decision | conditional |
| 5.1.6 | 5 / K1 | recognize, map-artifact | unit層; service層; UI層; shape識別; limitation識別 | none[- / -] | 上層ほど多く自動化; pyramid=組織図; 全testを一層へ | unsupported-number,unsupported-absolute | none |
| 5.1.7 | 6 / K2 | classify, map-artifact, compare | Q1 technology-facing/support; Q2 business-facing/support; Q3 critique product; Q4 technology-facing/critique | at-least-one[scope,audience,quality-characteristic / test-design] | quadrant=実行順; 各test一意固定; automation可否の分類 | single-factor-decision,terminology-conflation | none |
| 5.2.1 | 5 / K1 | recognize, map-artifact | likelihood識別; impact識別; risk level; hazardとの区別; risk item識別 | none[- / -] | risk=既発生issue; impactだけでlevel; likelihood=priority | unsupported-number,terminology-conflation | none |
| 5.2.2 | 6 / K2 | distinguish, classify | project schedule risk; resource risk; product quality risk; mixed risk | both[risk,scope,observed-outcome / risk-register] | 全riskがproduct risk; defect=project risk; schedule遅延は常にproduct defect | name-or-title-only,single-factor-decision | none |
| 5.2.3 | 5 / K2 | explain-causal, select-with-justification, compare | scope深度; technique選択; priority; resource配分; reporting | both[risk,coverage,priority,cost-or-effort / risk-register] | analysis後もtest不変; 高risk=case数だけ増加; low riskは無試験 | single-factor-decision,unsupported-absolute | conditional |
| 5.2.4 | 5 / K2 | classify, select-with-justification, explain-causal | mitigation by testing; transfer; acceptance; contingency; monitoring | both[risk,actor-role,observed-outcome / risk-record,plan] | testingでrisk消滅; responseはtester単独; residual risk報告不要 | context-free-generalization,unsupported-absolute | conditional |
| 5.3.1 | 5 / K1 | recognize, map-artifact | progress metric; quality metric; coverage metric; defect metric; efficiency metric | none[- / -] | metric単独で意思決定; case数=品質; defect数比較は常に公平 | context-free-generalization,unsupported-number | none |
| 5.3.2 | 5 / K2 | explain-causal, compare, map-artifact | progress report; completion report; audience tailoring; risk/status emphasis; decision support | both[audience,timing,communication-need / report] | 全audience同一詳細; report=raw data; bad news非表示 | context-free-generalization,privacy-or-hostile-content | none |
| 5.3.3 | 5 / K2 | classify, select-with-justification, compare | dashboard; written summary; meeting; alert/escalation; asynchronous update | at-least-one[timing,audience,communication-need,constraint / communication-plan,report] | dashboardだけで十分; urgent issueを定例待ち; 全情報を全員へ | product-knowledge-dependency,single-factor-decision | none |
| 5.4.1 | 6 / K2 | explain-causal, map-artifact, select-with-justification | version identification; baseline; environment/config; trace/reproduce | both[artifact-state,environment,observed-outcome / configuration-record] | 最新だけ保存; testwareは対象外; environment差は無関係 | name-or-title-only,missing-required-evidence | none |
| 5.5.1 | 14 / K3 | construct, apply-technique | reproducible steps; expected/actual; severity/priority; environment/evidence; concise title; duplicate discrimination | both[expected-actual,environment,priority,observed-outcome / defect-report] | expected省略; severity=priority; 推測原因を事実扱い | privacy-or-hostile-content,missing-required-evidence | conditional |

### 4.6 第6章（exact 25）

| LO | quota / K | 許可する認知操作 | 独立pattern family target literal | evidenceRequirement | 代表的誤概念群 | 追加禁止code | 数値oracle |
|---|---:|---|---|---|---|---|---|
| 6.1.1 | 15 / K2 | classify, map-artifact, select-with-justification | management support; static support; design support; execution support; non-functional support; collaboration/report support | both[activity,scope,constraint,tool-capability / tool-profile] | toolが期待結果を決定; 一toolで全活動; category=製品名 | product-knowledge-dependency,name-or-title-only | none |
| 6.2.1 | 10 / K1 | recognize, map-artifact | repeatability benefit; speed/coverage benefit; maintenance risk; false confidence; rollout/pilot | none[- / -] | automationでmanual不要; 初期費用だけ; automated resultは常に正しい | unsupported-number,unsupported-absolute | none |

## 5. 検証invariant

公式章配分の根拠は`ContentOfficialExamStructureBasisV1`だけを正本とし、CTFL 40問の章別`8 / 6 / 4 / 11 / 9 / 2`を固定します。500倍換算は`500 * chapterQuestionCount / 40`とし、生値は`100 / 75 / 50 / 137.5 / 112.5 / 25`です。まずfloorした合計499へ最大の小数剰余から一問を加え、小数剰余が同率の第4章・第5章は章番号昇順で第4章を選ぶため、exact quotaは`100 / 75 / 50 / 138 / 112 / 25`になります。K別`8 / 24 / 8`は端数なしで`100 / 300 / 100`です。source documentの版・SHA-256・確認時刻と丸め規則は`officialExamStructureBasisHash`へ固定し、同hashを含むbasis全体を`allocationHash`へlosslessに含めます。公式構成改訂時は既存allocationを上書きせず新versionを作ります。

### 5.1 blueprint自身

1. `entries.length === 64`で、LO codeは重複なしです。
2. chapter/section/LO code・title・Kと、LO code・章・quota・derived Kのtupleは本書§3.3・§4のliteral registryと全値一致し、入力値だけからexpectedを自己生成しません。
3. quota合計は500、章別は`100 / 75 / 50 / 138 / 112 / 25`、K別は`100 / 300 / 100`です。
4. 各entryの認知操作はderived Kの許可集合の部分集合で、空集合を拒否します。K1/K2へ`calculate`、K3へ`interpret-evidence`を登録できません。
5. pattern familyはLO内でID・名称・`discriminatingReasoning`が重複せず、`familyId === <LO>:pfNN`です。quota 5は最低5、quota 6〜8は最低4、quota 9〜11は最低5、quota 12以上は最低6 familyです。このpiecewise ruleを一律4へ弱められません。
6. 全entryで誤概念群、許可形式、追加禁止codeがnon-emptyです。`allowedQuestionForms`は§2.2のmapとexact一致します。表の`mode[facts / artifacts]`は`requiredMode/requiredFactKinds/requiredArtifactKinds`へ写像します。K1の`requiredMode='none'`ではrequired 2配列をemptyとし、required evidence件数を0に固定しますが、context evidence用の`permittedFactKinds/permittedArtifactKinds`は§2の全kind registryを保持します。K2/K3は`at-least-one | both`で、required和集合がnon-empty、`both`はrequired 2配列ともnon-emptyです。全Kでpermitted 2配列の和集合はnon-emptyで、required kindは対応permitted kindの部分集合です。
7. `patternFamilyMaximumShareBasisPoints === 3500`であり、比率判定は整数演算`familyCount * 10000 <= exactQuota * 3500`だけを使います。
8. `numericOraclePolicy='required'`の問題は全件calculation oracleを持ち、`none`は持ちません。`conditional`は数値が正答導出に必要な時だけcalculationを要求し、装飾的数値では`none`とします。
9. formula registryと独立runnerのID/digestは生成開始前に固定し、空値・placeholder・同一実装digestを拒否します。

### 5.2 500問集合

1. `ContentPrivateQuestionV3`はexact 500件、stable ID/version key重複0、各LO quota exactです。
2. chapter、K、LOはblueprintから導出し、問題側自己申告との不一致をerrorにします。
3. `patternFamilyId`、`cognitiveOperation`、`questionForm`は対象LOで許可された値だけです。各LOでpiecewise family数を満たし、1 familyは3500 basis points以下です。quota 5は5 familyへ1問ずつ割り当てます。
4. 各premiseは`sourceFactKeys`と`sourceArtifactKeys`の双方を空配列にできますが、和集合はnon-emptyです。参照keyは同じquestion内に存在し、重複しません。全`ScenarioFactV1.kind`と`ScenarioArtifactV1.kind`はLO entryの対応permitted listに所属し、`answerRelevance='required'`のkindは対応required listにも所属します。entryが`both`なら各問題にrequired factとrequired artifactを最低1件、`at-least-one`ならどちらかを最低1件要求します。K1はrequired evidence exact 0ですが、permitted list内のcontext evidenceを持てます。
5. `reasoningSteps.length`は1〜12です。全required evidenceを最低一つのpremiseと`ReasoningStepV1`が参照し、各stepの入力key、premise key、結論claim keyは存在します。全asked claimが最低一つのstepの結論となります。`stepNumber`は正のsafe integer、重複なし、集合がexact `1..reasoningSteps.length`です。canonicalizerはreasoning stepだけを`stepNumber`の数値昇順で並べ、文字列表現のbyte昇順を使いません。0件、13件、欠番、重複をprivate/API/DBの同一生成schemaで拒否します。装飾的なシステム名・人名・数値だけの差替えは独立問題として数えません。
6. 正答集合は`correctChoiceStableIds`だけを正本とします。choiceに正誤flagを保存せず、正答booleanをauthorable inputとして受理しません。正答集合所属から`ValidatedChoiceV3`を導出し、correct/incorrect branchの全fieldをstrict検証します。
7. `release_candidate`のchoicesは4〜8件で、stable ID、label、sort orderはunique、sort orderは0始まり連続です。全choiceの`relevantPremiseKeys`と`relevantClaimKeys`はnon-emptyで参照先が存在します。正答choiceの`addressedPremiseKeys`・`addressedClaimKeys`の各和集合が設問要求集合とexact一致します。不正解choiceのaddressed配列はemptyで、登録誤概念code、具体的否定根拠、`errorType!='none'`を要求します。generic true-but-unrelated choiceはerrorです。`compatibility_only`は別schema・別countとして隔離し、本集合へ一件でも入ればerrorです。
8. reasoning step、総合解説、全choice解説、takeaway、common trapはnon-emptyです。正答理由はfact/artifactから結論まで、不正解理由は誤っている具体点まで記述します。takeaway/common trapを回答前safe DTOへ射影せず、単独または組合せで正答choice、正答数、正答位置、計算結果を推測できる候補はchoice cue gateで拒否します。
9. 既存canonical questionの全fieldに`ContentCanonicalQuestionLearningMetadataV3`、各canonical choiceに`ContentCanonicalChoiceLearningMetadataV3`を必須追加し、`cognitiveOperation`、`patternFamilyId`、`questionForm`、`examEligibility`、`distributionScope`、`takeaway`、`commonTrap`、choiceごとの`relevantClaimKeys`を一件も欠落させず写像します。private source、DB、API、独立runnerのcanonical bytesを一致させ、`practice-only`を模試候補へ含めません。
10. provenanceは本書から生成したstrict `ContentProvenanceV2`全fieldを要求します。`authoredAt`、exact一対一のpre-freeze accountability artifact、全model run、第三者・公式サンプル一致数、全検出spanをlosslessにpersonal manifestへ結合します。第三者問題・公式サンプル問題一致は0、旧不合格bundle使用はfalse、normative sourceは§3.3のcode exactです。検出spanはapproved公式用語または人手確認済み非問題規範断片だけを許し、copyright・terminology artifact hashをpersonal/public manifestへ結合します。
11. identity assertionのcontent ref、subject hash、statement version/hashはsubject・accountability artifactとexact一致し、A/B swapを拒否します。nonce/public key/signatureはbase64url no-paddingの再encode一致とdecode長32/32/64 bytesを検証し、service assertionを自然人の否認防止署名として扱いません。
12. §3.2.1の各補助hashはexact preimage、除外field、配列順、literal goldenへ一致し、自己hash混入、未知field、配列swap、Unicodeの暗黙正規化を拒否します。
13. personal human reviewは一回発行CSPRNG seedの署名済み完全抽出artifactへ`canonicalHash`、`blueprintHash`、`allocationHash`、`qualityGateConfigHash`、`samplingFreezeHash`を結合し、全population/rank/cutoff/mandatory/final集合を省略しません。同一freezeへの再発行、seed選別、content hash由来seedを拒否します。domain-separated JCS rankからartifact全体を再現できなければpersonal manifestを拒否します。
14. 全reviewは`ContentReviewArtifactV2`のstrict branchで、4対象hashとreview policy versionがfreeze対象へ一致します。machine report、blind solveの提出先行・正答完全一致、version付きhuman checklistをbranchどおり検証し、V1 artifactだけ、branch余剰field、evidence hash不一致、未解決issueを含むcoverageを拒否します。
15. 同一private sourceからcanonical choiceの`relevantClaimKeys`だけを追加・削除・別claimへ差替え・配列swapしたliteral negative fixtureは、DB/API/独立canonicalizerの全てで別`contentHash`へなり、bundle `canonicalHash`とpersonal/public `manifestHash`も変化します。旧acceptance/attestationでstage/activate/publishする操作を拒否します。takeaway/common trapだけを変更したfixtureも同じhash失効規則へ従います。
16. 全500件にgeneration artifact exact一件、G0〜G12 artifact exact 13件を要求します。G0 schema/canonical、G1設問成立、G2独立blind solve、G3正答根拠、G4 multiple全単射、G5誤答魅力度・曖昧性、G6手掛かり・日本語、G7 LO/K/難易度、G8数値oracle、G9重複・意味類似、G10著作権・provenance、G11 UI/A11y表示、G12独立adjudicationを一問単位で検査し、allowed N/A以外はpassとします。
17. personal acceptanceには、active owner principalによる`ContentOwnerPersonalReviewArtifactV1`とcoverageをexact 500件要求します。全artifactのblind packet disclosure countは5項目すべて0、transitionは`blind/revealed/hidden/audit-completed` exact順、decisionは全件`pass`、changes_required issueは0です。ownerは隔離review UIで各問題を個別に判定し、bulk pass、AIによるowner代行、未閲覧問題の自動passを拒否します。既存の独立`personal-human`抽出reviewは別防御として維持します。
18. `ContentGenerationArtifactV1`、G0〜G12 artifact、`ContentAiReviewCoverageV1`、owner artifact/coverageは本書の生成型からAPI/DB/validatorを作り、private→API→DB→API→独立canonicalizerの全field・canonical bytes・hashをlossless一致させます。API/DBが別の件数、enum、optional fieldを受ける場合は失敗です。

### 5.3 単一・複数選択

- singleは`requiredChoiceCount=1`、正答stable ID exact 1です。正答choiceのaddressed premise/claim集合がasked claimから要求される集合とexact一致します。
- multipleはD-04推奨案としてexact 60、すべて`requiredChoiceCount=2`、正答stable ID exact 2です。章配分は`12 / 9 / 6 / 17 / 13 / 3`、K配分は`6 / 39 / 15`です。
- multipleはexact 2 premiseとexact 2 asked claimを持ちます。各正答は異なる1 premise・1 claimだけをaddressし、2正答のpremise和集合とclaim和集合が各要求集合exact、各積集合が空となる全単射を要求します。
- multipleの不正解choiceは`addressedPremiseKeys=[]`かつ`addressedClaimKeys=[]`ですが、`relevantPremiseKeys`と`relevantClaimKeys`はnon-emptyです。二つの単一問題を単純結合した設問、元premiseの逐語再掲を手掛かりにした誤答、別の正しい一般論を拒否します。
- choice順変更、ラベル変更、scenario固有名詞だけの変更は別問題として数えません。

### 5.4 数値oracle

数値が正答判定に必要な設問はclaim単位で、入力、登録式ID/unit variant、中間値、丸めmode/scale、exact期待値、表示期待値、単位、全numeric choiceの候補値bindingを保存します。input key集合、各kind/unit/domain、cross constraint、rounding、result unitはformula registryのliteralとexact一致させます。calculationのclaim keyはuniqueでasked claimの部分集合、数値を必要とするasked claimとはexact一致します。`PrivateChoiceV3.relevantClaimKeys`が当該calculation claimを含むchoice stable ID集合と`choiceValueBindings`のchoice stable ID集合はexact一致し、bindingはchoice stable ID順、unique、同じquestionのchoiceだけを許可します。複数選択の二つの数値claimは別々の`ClaimCalculationV1`を要求します。formula registryと独立runnerのdigestをblueprint・question・manifestで一致させ、生成器とコード共有しないrunnerが全件再計算します。期待値とexact一致するbindingのchoice ID集合が、当該claimをaddressする`correctChoiceStableIds`の部分集合とexact一致することを検査し、正答集合自体は複製しません。式未登録、key/kind/unit/domain/variantの不正組合せ、非canonical decimal/rational、単位不一致、暗黙の丸め、入力なし、binding不足・余剰、選択肢だけから逆算できる問題を拒否します。BVA、decision table、state transition、coverage、見積りで「個数」を問う場合もoracle対象です。

`NumericOracleVerificationArtifactV1`は各`ClaimCalculationV1`をcontent refとclaim keyでexact一対一に射影するlossless正本です。entry tuple `(questionStableId,versionStableKey,claimKey)`はuniqueかつその順でsortし、formula ID、scalar/rational/rational-list inputs、中間値、丸めmode/scale、scalar/ordered-set expected値、独立runnerのoracle値、unit、全choice bindingを保持します。expectedとoracleはkind、exact/display値、配列順まで一致しなければ`agreement`相当へ縮退せずreleaseを拒否します。choice bindingはchoice stable ID順で、同じquestionの全numeric choiceをexact被覆します。API/DBのartifact型は本schemaから生成し、canonical decimal一個だけの別形式、claim key欠落、ordered-setのscalar化を禁止します。

## 6. release前coverage report

sanitized reportは本文、選択肢、正答stable IDを含めず、次だけを出力します。

- blueprint hash、allocation version、schema version、chapter/section/LO registry hash
- 500 / 64 / chapter / K / single-multipleのexact count
- LOごとのquota、piecewise family最低数、最大family share basis points、認知操作・question form分布
- choice 4〜8件、stable ID/label/sort unique、正答集合単一正本、single直接対応、multiple premise/claim全単射、required count、章/K配分の検査件数と失敗0
- K2/K3 evidence mode、premise source和集合、required fact/artifact、structured reasoning coverage 100%
- exam eligibility、distribution scope、canonical cognitive operation/pattern family/question form、takeaway/common trap、choice relevant claimの欠落0
- 数値oracle対象claim数、formula/runner digest、content ref＋claim key unique/sort、scalar/rational/rational-list inputs、中間値、丸めmode/scale、scalar/ordered-set expected/oracle値、unit、全choice bindingのlossless照合、独立再計算数、正答choice binding不一致0
- generic true-but-unrelated、回答前takeaway/common trap混入、正答手掛かり、空metadata、未知enum、重複・意味類似candidateの未処理0
- human/model provenance、copyright/terminology/tokenizer span、日本語、choice cue、独立reviewの未解決0
- `ContentReviewArtifactV2`全branchの4対象hash/review policy/evidence hash一致、machine full report、blind提出先行・正答集合一致、human checklist version/result、V1-only artifact 0、review coverage exact
- generation artifact exact 500、G0〜G12 artifact exact 6,500、AI coverageの欠落・余剰・重複・stale・未解決0、生成/blind/adjudication run独立、blueprint生成型とAPI/DBのlossless一致
- owner personal review exact 500、blind初期開示5項目0、一問ごとのreveal/hide/audit順、decision全件pass、changes_required issue 0
- accountability artifact exact 500、subject/content ref/principal/assertion検証済み、artifact再利用・旧subject流用0
- statement registry digest、identity対象5 field、base64url decode長、A/B swap拒否の検査件数と失敗0
- allocation/blueprint/quality/corpus/review/oracle/provenance補助hashのgolden一致、自己hash・配列swap・未知field拒否
- personal human review sampling artifactの一回発行、canonical/blueprint/allocation/qualityの4対象hashとfreeze hash binding、artifact全fieldのlossless保存、seed再発行0、全population/stratum rank/cutoff/mandatory/final集合の再計算一致
- quality/reviewの全digestがlowercase SHA-256、全ID/provider/runがtrim後non-emptyで、空・placeholder・不正digestの拒否件数

いずれかが未達なら件数を埋めず、問題を差し戻します。
