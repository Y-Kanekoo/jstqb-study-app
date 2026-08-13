# API・DTO契約 v2

## 1. 共通規則

本書は、同期、問題catalog、セッション再開、feedback、模試の公開境界を固定します。境界入力は`unknown`からstrict schemaで検証し、TypeScriptの`any`を使用しません。

```ts
type UUID = string;
type IsoUtcTimestamp = string;
type QuestionId = string;
type QuestionVersionId = string;
type ChoiceId = string;
type DataGeneration = number;
type ContentChannel = 'public' | 'personal_preview';
type ContentAssurance = 'published' | 'owner_preview' | 'legacy_compatibility';
type ExamPolicy = 'verified_only' | 'allow_offline_reference';
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];
type Sha256HexV1 = string;
type PositiveSafeIntegerV1 = number;
type NonNegativeSafeIntegerV1 = number;
type NonEmptyTrimmedStringV1 = string;
type UuidV1 = UUID;
type IsoUtcTimestampV1 = IsoUtcTimestamp;
type OfficialSourceIdV1 =
  | 'jstqb-foundation-syllabus-2023v4.0.j02'
  | 'jstqb-foundation-guidance'
  | 'istqb-exam-structure-tables-v1.18';
type OfficialSourceUrlV1 =
  | 'https://www.jstqb.jp/syllabus/'
  | 'https://www.jstqb.jp/guidance/'
  | 'https://istqb.org/wp-content/uploads/2026/05/ISTQB_Exam-Structure-Tables_v1.18.pdf';
type Base64Url32BytesV1 = string;
type Base64Url64BytesV1 = string;
type ContentIssueCategory =
  | 'incorrect_answer'
  | 'unclear'
  | 'outdated'
  | 'typo'
  | 'other';
type PortableActorRoleV2 = 'owner' | 'content-admin' | 'system-operation';
type ContentIssueStatusV2 = 'open' | 'investigating' | 'resolved' | 'rejected';
type AttemptCorrectionReasonCodeV2 =
  | 'answer_key_corrected'
  | 'grading_rule_corrected'
  | 'operation_correction';
type AttemptInvalidationReasonCodeV2 =
  | 'question_suspended'
  | 'acceptance_revoked'
  | 'answer_corrected'
  | 'operation_invalidated';
type SessionLifecycleReasonCodeV2 =
  | 'all_answerable_items_completed'
  | 'user_abandoned'
  | 'question_suspended'
  | 'acceptance_revoked'
  | 'operation_invalidated';

// 正本は content-blueprint-v1.md。API、DB、private runnerは同じ生成型とregistry digestを使う。
type CognitiveOperationV1 =
  | 'recognize' | 'map-artifact' | 'distinguish' | 'classify' | 'compare'
  | 'explain-causal' | 'interpret-evidence' | 'select-with-justification'
  | 'apply-technique' | 'calculate' | 'construct';
type QuestionFormV1 =
  | 'definition-recognition' | 'role-or-artifact-mapping' | 'scenario-classification'
  | 'cause-effect-explanation' | 'comparison' | 'best-action-with-rationale'
  | 'worked-application' | 'calculation' | 'artifact-construction' | 'defect-detection';
type ScenarioFactKindV1 =
  | 'actor-role' | 'activity' | 'artifact-state' | 'timing' | 'sequence'
  | 'observed-outcome' | 'change' | 'constraint' | 'risk' | 'cost-or-effort'
  | 'scope' | 'dependency' | 'input-domain' | 'business-rule' | 'control-flow'
  | 'execution-trace' | 'coverage' | 'priority' | 'audience' | 'environment'
  | 'quality-characteristic' | 'history' | 'lifecycle' | 'communication-need'
  | 'tool-capability' | 'expected-actual';
type ScenarioArtifactKindV1 =
  | 'requirement-excerpt' | 'plan' | 'work-product' | 'log' | 'change-record'
  | 'risk-record' | 'trace-matrix' | 'role-matrix' | 'lifecycle-model' | 'pipeline'
  | 'architecture-model' | 'criterion-set' | 'review-record' | 'review-charter'
  | 'code-or-control-flow' | 'coverage-report' | 'test-design' | 'partition-table'
  | 'boundary-table' | 'decision-table' | 'state-model' | 'defect-history'
  | 'test-charter' | 'checklist' | 'user-story' | 'estimate-sheet' | 'backlog'
  | 'risk-register' | 'report' | 'communication-plan' | 'configuration-record'
  | 'defect-report' | 'tool-profile';
type ChoiceErrorTypeV1 =
  | 'none' | 'adjacent-concept' | 'reversed-causality' | 'wrong-scope'
  | 'partial-correction' | 'wrong-artifact-or-role' | 'wrong-calculation'
  | 'unsupported-assumption';
type NonZeroDigitV1 = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type DigitV1 = '0' | NonZeroDigitV1;
type PatternFamilyOrdinalV1 = `0${NonZeroDigitV1}` | `${NonZeroDigitV1}${DigitV1}`;

interface ExamBlueprintV1 {
  readonly schemaVersion: 'exam-blueprint.v1';
  readonly questionCount: 40;
  readonly durationMinutes: 60;
  readonly passingScore: 26;
  readonly chapterCounts: readonly [8, 6, 4, 11, 9, 2];
  readonly kLevelCounts: readonly [8, 24, 8];
  readonly selectionTypePolicy: 'unconstrained';
}

type LearningMode =
  | 'chapter'
  | 'random'
  | 'wrong'
  | 'review'
  | 'exam';

type SessionStatus =
  | 'active'
  | 'completed'
  | 'abandoned'
  | 'invalidated';

type LearningSyncKind =
  | 'session.created'
  | 'draft.saved'
  | 'answer.submitted'
  | 'session.advanced'
  | 'session.submitted'
  | 'session.review-marked'
  | 'bookmark.changed'
  | 'note.saved'
  | 'issue.reported';

type ClientSyncKind = Exclude<LearningSyncKind, 'session.submitted'>;
```

- `Sha256HexV1`はstrict schemaで`^[0-9a-f]{64}$`、`PositiveSafeIntegerV1`は`Number.isSafeInteger(value) && value > 0`、`NonNegativeSafeIntegerV1`は`Number.isSafeInteger(value) && value >= 0`を満たす値だけをbrand化する。無検証castを禁止する。
- `Base64Url32BytesV1`と`Base64Url64BytesV1`はbase64url no-paddingをdecodeしてexact 32/64 bytes、canonical再encode一致を要求する。
- UUIDはlowercase canonical形式とする。
- `QuestionVersionId`はDBのlowercase canonical UUIDだけを受理する。`QuestionId`と`ChoiceId`はcontent stable IDであり、version row lockのsort keyへ使用しない。
- timestampはUTC millisecond固定の`YYYY-MM-DDTHH:mm:ss.SSSZ`だけを受理する。
- canonical bytesはRFC 8785 JCSのUTF-8とし、Unicode正規化を行わず入力code pointを保持する。
- `undefined`、`NaN`、`Infinity`、浮動小数をDTOに含めない。
- numberはJavaScript safe integer範囲に限定する。
- objectの未知keyと文字長超過は全strict schemaで拒否する。配列の重複拒否は、schemaで`set-like`または`uniqueBy(registry key/tuple)`と明示した配列だけへ適用し、各annotationが指定する正規keyで判定する。ordered tuple、順序に意味があるlist、multiset、count tupleには包括的な重複除去を適用せず、同値要素を保持する。たとえば公式K配分`[8,24,8]`は有効なordered count tupleであり、二つの`8`を重複エラーにしない。validatorは各生成schemaのunique annotation/registryを正本とし、annotationのない配列へ推測でunique制約を足さない。共通fixtureは、unique指定配列の同一key二件を拒否するnegative、`[8,24,8]`と重複を含む許可済みordered/multisetをその順序・件数のまま受理するpositive、ならびに各schema固有のtuple長・位置・count制約違反を拒否するnegativeを分離する。
- `contentChannel='personal_preview'`は`contentAssurance='owner_preview'`だけ、通常の`public`は`published`だけを許可する。`legacy_compatibility`はM1で既存18問sessionへ付与したowned hydration専用で、新規catalog/basis/session/exam/preview、正式SRS・分析へ使用しない。

## 2. 同期Envelope

### 2.1 Request

```ts
interface SyncEventEnvelopeV2<K extends ClientSyncKind> {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly eventId: UUID;
  readonly kind: K;
  readonly entityId: string;
  readonly occurredAt: IsoUtcTimestamp;
  readonly payload: ClientSyncRequestPayloadMap[K];
}

type AnyClientSyncEventV2 = {
  [K in ClientSyncKind]: SyncEventEnvelopeV2<K>;
}[ClientSyncKind];

interface SyncBatchRequestV2 {
  readonly events: readonly AnyClientSyncEventV2[];
}
```

RPC:

```sql
public.ingest_learning_sync_events_v2(p_events jsonb)
returns jsonb
```

制約:

- 1 batchは1～100 event。
- batch全体は1MiB以下。
- 1 eventは64KiB以下。
- batch全体を一つのDB transactionで処理する。
- batch内の全eventは同じdata generationでなければならず、混在時は全件を拒否する。
- 1 batchは単一aggregate keyだけを含む。aggregate keyは`session:<id>`、`note:<questionId>`、`bookmark:<questionId>`、`issue:<issueId>`のいずれか。
- 異なるaggregateを混在させず、同一sessionはlocal sequence順、aggregate間は独立並行とする。

### 2.2 Canonical response

```ts
interface CanonicalSyncEventV2<K extends LearningSyncKind> {
  readonly sequence: number;
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly eventId: UUID;
  readonly userId: UUID;
  readonly kind: K;
  readonly entityId: string;
  readonly occurredAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
  readonly origin: K extends ClientSyncKind ? 'client' : 'server';
  readonly requestHash: K extends ClientSyncKind ? Sha256HexV1 : null;
  readonly canonicalHash: Sha256HexV1;
  readonly payload: SyncCanonicalPayloadMap[K];
}

type AnyCanonicalSyncEventV2 = {
  [K in LearningSyncKind]: CanonicalSyncEventV2<K>;
}[LearningSyncKind];

type AnyClientCanonicalSyncEventV2 = {
  [K in ClientSyncKind]: CanonicalSyncEventV2<K>;
}[ClientSyncKind];

interface SyncBatchResponseV2 {
  readonly contractVersion: 2;
  readonly contract: 'learning-sync.v2';
  readonly dataGeneration: DataGeneration;
  readonly events: readonly AnyClientCanonicalSyncEventV2[];
  readonly serverSideEvents: readonly CanonicalSyncEventV2<'session.submitted'>[];
}
```

`serverSideEvents`は通常0件です。期限後の`draft.saved`が同じtransactionでexam finalizerを確定した場合だけ、同じsessionの保存済みterminalをexact 1件返します。generic ingestはこの配列へclient-origin eventや別sessionのterminalを入れず、再送時は初回と同じterminal envelope/hashを返します。clientはclient event ACK、terminal、session/attempt/history、outbox、cursorを一つのlocal transactionで適用し、terminalのstrict検証に失敗した場合はACKも行いません。

同じevent IDの正当な再送では、初回保存済みのsequence、receivedAt、hash、canonical payloadをそのまま返します。restore後の旧generationであっても、portable receiptに全値一致する既確定eventだけは書込みを行わないread-only replayとして同じevent responseを返し、batch外側の`dataGeneration`で現在generationを通知します。clientは当該eventをACK後、残る旧generation outboxを隔離してfull bootstrapします。未確定または異内容の旧generation eventは`STALE_DATA_GENERATION`です。

### 2.3 Pull

```sql
public.pull_learning_sync_events_v2(
  p_data_generation bigint,
  p_after_sequence bigint,
  p_limit integer default 100,
  p_snapshot_upper_bound bigint default null
) returns jsonb
```

```ts
interface PullLearningSyncEventsResponseV2 {
  readonly contractVersion: 2;
  readonly contract: 'learning-sync-pull.v2';
  readonly dataGeneration: DataGeneration;
  readonly snapshotUpperBound: number;
  readonly nextCursor: number;
  readonly hasMore: boolean;
  readonly events: readonly PullLearningEventDto[];
}

interface LegacyCanonicalSyncEventBaseV1 {
  readonly contractVersion?: undefined;
  readonly legacySchema: 'learning-sync.v1';
  readonly readOnly: true;
  readonly sequence: number;
  readonly eventId: UUID;
  readonly entityId: string;
  readonly occurredAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
}

type LegacyCanonicalSyncEventV1 =
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'session.created';
      readonly payload: {
        readonly sessionId: UUID;
        readonly mode: 'chapter' | 'random' | 'wrong' | 'review';
        readonly title: string;
        readonly questionIds: readonly QuestionId[];
        readonly createdAt: IsoUtcTimestamp;
      };
    })
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'draft.saved';
      readonly payload: {
        readonly sessionId: UUID;
        readonly questionId: QuestionId;
        readonly selectedChoiceIds: readonly ChoiceId[];
      };
    })
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'answer.submitted';
      readonly payload: {
        readonly sessionId: UUID;
        readonly questionId: QuestionId;
        readonly questionVersionId: QuestionVersionId;
        readonly selectedChoiceIds: readonly ChoiceId[];
        readonly isCorrect: boolean;
        readonly answeredAt: IsoUtcTimestamp;
      };
    })
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'session.advanced';
      readonly payload: {
        readonly sessionId: UUID;
        readonly questionId: QuestionId;
      };
    })
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'bookmark.changed';
      readonly payload: {
        readonly questionId: QuestionId;
        readonly enabled: boolean;
      };
    })
  | (LegacyCanonicalSyncEventBaseV1 & {
      readonly kind: 'session.submitted';
      readonly payload: {
        readonly sessionId: UUID;
        readonly status: 'completed';
        readonly answeredQuestionIds: readonly QuestionId[];
        readonly submittedAt: IsoUtcTimestamp;
      };
    });

type PullLearningEventDto =
  | AnyCanonicalSyncEventV2
  | LegacyCanonicalSyncEventV1;
```

初回呼出時に本人streamの`max(sequence)`を`snapshotUpperBound`へ固定し、`after < sequence <= snapshotUpperBound`をsequence昇順で返します。空streamは`snapshotUpperBound = p_after_sequence`、`nextCursor = p_after_sequence`、`hasMore = false`へ固定します。limitは1～500です。負数、`after > snapshotUpperBound`、現在stream上限より未来のcursor、継続pageでのupper bound差替えを拒否します。requestのgenerationが現在値と異なる場合は`STALE_DATA_GENERATION`を返し、端末は旧cursor/outboxを自動rebaseせず隔離してfull bootstrapします。page全件のstrict schema/semantic検証、local materialize、outbox ACK、cursor更新を一local transactionで行い、不正一件なら全て不変にします。v2 clientは本人限定allowlist RPCだけを使用します。旧client互換期間だけ既存RLSによる本人streamの直接SELECTを残し、最低対応version未満の利用が0でrollback windowも終了したcutover migrationで撤回します。v1履歴は上記read-only unionからmaterializeだけを行い、ACK、新outbox、server mutationへ使用しません。

## 3. 9種類のcanonical payload（client ingest 8種類＋server terminal 1種類）

### 3.1 `session.created`

通常演習と模試でrequestを分離します。

```ts
interface NormalSessionCreatedRequestBase {
  readonly sessionId: UUID;
  readonly mode: Exclude<LearningMode, 'exam'>;
  readonly title: string;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly contentChannel: ContentChannel;
  readonly previewAcceptanceId: UUID | null;
  readonly previewSelectionRevision: number | null;
  readonly catalogRevision: number;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly selectionSpec: NormalSelectionSpecV2;
  readonly selectionBasisId: UUID;
  readonly selectionBasisHash: Sha256HexV1;
}

type NormalSessionCreatedRequest = NormalSessionCreatedRequestBase & (
  | {
      readonly creationSource: 'online';
      readonly offlinePracticePackId: null;
      readonly offlinePracticePackHash: null;
    }
  | {
      readonly creationSource: 'offline-practice-pack';
      readonly offlinePracticePackId: UUID;
      readonly offlinePracticePackHash: Sha256HexV1;
    }
);

interface NormalSelectionSpecV2 {
  readonly source:
    | { readonly type: 'random' }
    | { readonly type: 'unanswered' }
    | { readonly type: 'weak'; readonly algorithmVersion: string }
    | { readonly type: 'bookmark' }
    | {
        readonly type: 'wrong';
        readonly filter: 'unresolved' | 'latest' | '7d' | '30d' | '90d' | 'ever' | 'recovered';
      }
    | { readonly type: 'review-due' };
  readonly scope: {
    readonly chapterNumbers: readonly number[];
    readonly sectionCodes: readonly string[];
    readonly learningObjectiveCodes: readonly string[];
    readonly difficulties: readonly (1 | 2 | 3)[];
    readonly bookmarkOnly: boolean;
  };
}

interface ExamSessionCreatedRequest {
  readonly sessionId: UUID;
  readonly mode: 'exam';
  readonly title: string;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly contentChannel: ContentChannel;
  readonly previewAcceptanceId: UUID | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
}

type SessionCreatedRequest =
  | NormalSessionCreatedRequest
  | ExamSessionCreatedRequest;

interface SessionCreatedCanonical {
  readonly sessionId: UUID;
  readonly mode: LearningMode;
  readonly title: string;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly dataGeneration: DataGeneration;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy | null;
  readonly catalogRevision: number;
  readonly selectionBasisId: UUID | null;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly actualQuestionCount: number;
  readonly answerableQuestionCount: number;
  readonly selectionSpec: NormalSelectionSpecV2 | null;
  readonly examBlueprintVersion: string | null;
  readonly examBlueprintHash: Sha256HexV1 | null;
  readonly items: readonly {
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly ordinal: number;
    readonly choiceOrder: readonly ChoiceId[];
    readonly status: 'active' | 'invalidated';
    readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked' | null;
  }[];
  readonly createdAt: IsoUtcTimestamp;
  readonly startedAt: IsoUtcTimestamp;
  readonly durationMinutes: number | null;
  readonly expiresAt: IsoUtcTimestamp | null;
  readonly revision: number;
}
```

```sql
public.issue_learning_selection_basis_v2(
  p_data_generation bigint,
  p_session_id uuid,
  p_certification_code text,
  p_syllabus_version text,
  p_mode text,
  p_requested_question_count integer,
  p_selection_spec jsonb,
  p_content_channel text default 'public',
  p_preview_acceptance_id uuid default null,
  p_preview_selection_revision bigint default null
) returns jsonb
```

```ts
interface LearningSelectionBasisV2 {
  readonly basisId: UUID;
  readonly ownerUserId: UUID;
  readonly sessionId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly mode: Exclude<LearningMode, 'exam'>;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly selectionSpec: NormalSelectionSpecV2;
  readonly syncUpperBound: number;
  readonly serverChangeUpperBound: number;
  readonly projectionRevision: number;
  readonly catalogRevision: number;
  readonly eligibleCount: number;
  readonly eligibleSetHash: Sha256HexV1;
  readonly selectedItems: readonly {
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly ordinal: number;
    readonly choiceOrder: readonly ChoiceId[];
    readonly content: PreAnswerQuestionDto;
  }[];
  readonly selectionSeed: string;
  readonly algorithmVersion: string;
  readonly algorithmRegistryDigest: Sha256HexV1;
  readonly issuedAt: IsoUtcTimestamp;
}

interface DiscardLearningSelectionBasisCommandV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly basisId: UUID;
  readonly reasonCode:
    | 'user_discarded'
    | 'restore_empty_namespace_cleanup';
}

interface SelectionBasisDiscardedFactV2 {
  readonly discardFactId: UUID;
  readonly operationId: UUID;
  readonly basisId: UUID;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly reasonCode:
    | 'user_discarded'
    | 'restore_empty_namespace_cleanup';
  readonly discardedAt: IsoUtcTimestamp;
}

interface BootstrapSelectionBasisSourceMetadataV2 {
  readonly sourceType: 'selection-basis-issued';
  readonly sourceSessionId: UUID;
  readonly basisRevision: 1;
  readonly requestHash: Sha256HexV1;
  readonly responseHash: Sha256HexV1;
  readonly issuedAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
  readonly basisRowHash: Sha256HexV1;
}

type BootstrapSelectionBasisLifecycleV2 =
  | {
      readonly state: 'unconsumed';
      readonly consumedEventId: null;
      readonly discardFact: null;
      readonly lifecycleSource: null;
    }
  | {
      readonly state: 'consumed';
      readonly consumedEventId: UUID;
      readonly discardFact: null;
      readonly lifecycleSource: {
        readonly sourceType: 'sync-event';
        readonly sourceEventId: UUID;
        readonly sourceSequence: NonNegativeSafeIntegerV1;
        readonly requestHash: Sha256HexV1;
        readonly canonicalHash: Sha256HexV1;
        readonly receivedAt: IsoUtcTimestamp;
      };
    }
  | {
      readonly state: 'discarded';
      readonly consumedEventId: null;
      readonly discardFact: SelectionBasisDiscardedFactV2;
      readonly lifecycleSource: {
        readonly sourceType: 'command';
        readonly sourceCommandId: UUID;
        readonly requestHash: Sha256HexV1;
        readonly responseHash: Sha256HexV1;
        readonly receivedAt: IsoUtcTimestamp;
      };
    };

interface AcceptanceRevokedContentTombstoneV2 {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly acceptanceId: UUID;
  readonly revocationId: UUID;
  readonly revokedAt: IsoUtcTimestamp;
  readonly reason: 'acceptance_revoked';
}

type BootstrapSelectionBasisItemV2 = {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: NonNegativeSafeIntegerV1;
  readonly choiceOrder: readonly ChoiceId[];
} & (
  | {
      readonly contentAvailability: 'available';
      readonly content: PreAnswerQuestionDto;
      readonly tombstone: null;
    }
  | {
      readonly contentAvailability: 'suspended-tombstone';
      readonly content: null;
      readonly tombstone: CatalogTombstoneDto & { readonly reason: 'suspended' };
    }
  | {
      readonly contentAvailability: 'acceptance-revoked-tombstone';
      readonly content: null;
      readonly tombstone: AcceptanceRevokedContentTombstoneV2;
    }
);

interface BootstrapLearningSelectionBasisV2
  extends Omit<LearningSelectionBasisV2, 'selectedItems'> {
  readonly selectedItems: readonly BootstrapSelectionBasisItemV2[];
}

interface BootstrapSelectionBasisRowV2 {
  readonly basis: BootstrapLearningSelectionBasisV2;
  readonly basisSource: BootstrapSelectionBasisSourceMetadataV2;
  readonly lifecycle: BootstrapSelectionBasisLifecycleV2;
}

interface DiscardLearningSelectionBasisResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly basisId: UUID;
  readonly status: 'discarded';
  readonly discardFactId: UUID;
  readonly discardedAt: IsoUtcTimestamp;
}
```

```sql
public.discard_learning_selection_basis_v2(p_command jsonb) returns jsonb
```

response型は`CommandExecutionResponseV2<DiscardLearningSelectionBasisResponseV2>`です。clientはcommandをdurable outboxへ保存してから送信し、同じcommand IDの保存済みresponseを確認した後だけlocal basisを使用不可へ移します。応答喪失時は同じcommandを再送します。

DBは同一transactionでclientが先に発行したsession ID、mode、資格、syllabus、選定条件、希望数、content scope、data generation、catalog revision、両stream上限、projection revision、候補集合、選定結果、choice order、回答前safe本文を計算し、immutableなbasis snapshotとして保存して返します。`(ownerUserId,sessionId)`を冪等keyとしてlockし、同じRFC 8785 JCS正規化入力の再試行は同じbasis ID・seed・snapshotを返し、異内容の同session ID再利用は`IDEMPOTENCY_KEY_REUSED`で拒否します。basis IDは一つのsession IDだけに結合し、session作成時に同じuser/session/eventへ一度だけconsumeします。同じbasisから別sessionを作ることはできません。`eligibleSetHash`はquestion stable ID、question version stable keyを昇順にした候補集合のRFC 8785 JCS SHA-256です。`selectionSeed`はDB CSPRNGが発行する32 byteのlowercase hexで、`selection-v1`は各候補を`SHA-256(seedBytes || UTF8('selection-v1') || 0x00 || UTF8(questionStableId) || 0x00 || UTF8(versionStableKey))`のbyte昇順、同値時stable ID昇順で並べ、先頭N件を`selectedItems`とします。choice orderも`UTF8('choice-order-v1') || 0x00`の別domain separatorを付けた同seed hash順でDBが固定します。weakだけはregistryで固定したscore降順を第一keyにし、同score内で同じhash順位を使います。algorithm registry artifact自体のSHA-256を`algorithmRegistryDigest`へ保存します。publicは正式projection、personal previewは同じactive acceptanceのpreview projectionだけを固定します。clientはresponseのgeneration、owner、session ID、件数、safe DTO schema、禁止field 0だけを検証し、選定や過去revisionのprojectionを再計算しません。safe snapshotをlocal transactionへ保存した後に問題画面へ進めます。`session.created`は`basisId`だけを参照し、serverは保存済みitem順・version・choice order・safe内容からsessionを作成します。client任意itemを受け付けません。未送信outboxはbasis候補へ混入しないため、反映したい場合はonline同期後に新basisを取得します。

offlineで新規通常演習を開始できるのは、§7.1のdedicated issue RPCがreserved session IDへ発行し、端末へdurable保存済みの未consume pack/basisがある場合だけです。packがなければofflineでは既存session再開だけを許可し、cached catalogから任意に新規選定しません。offline用embedded `session.created`は通常ingest outboxへ入れず、専用consume command outboxへ保存します。

未consume basisを利用者が破棄する場合は専用commandだけを使用します。shared user lockとbasis row lock下でowner、current generation、未consume、未discardを検証し、basis原行を更新・削除せずappend-only `SelectionBasisDiscardedFactV2`を確定します。factの`operationId`はcommandの`commandId`とexact一致させ、通常操作は`user_discarded`、restore dry-runで列挙した空namespace準備は`restore_empty_namespace_cleanup`だけを許可します。同一command ID・同一request hashは保存済みresponse、異内容は`IDEMPOTENCY_KEY_REUSED`です。discard済みbasisのconsumeは常に拒否します。旧generation全体の廃棄はpublic RPCや本factへ`generation_superseded`を偽装せず、stale namespace単位のlocal atomic discard auditだけで扱います。restoreの空判定では、consume済みbasisは学習履歴として非empty、未consumeかつ未discard basisは未確定学習状態として非empty、discard済み未consume basisとそのdiscard factだけはcontrol auditとして保持しつつempty判定から除外します。restore confirmがbasisを暗黙破棄することは禁止し、利用者はdry-runに列挙されたbasis IDをこのcommandで明示破棄してから再dry-runします。

- `entityId === sessionId`。
- 通常演習の希望数は10 / 20 / 30 / 40。basisの`eligibleCount >= requestedQuestionCount`なら`selectedItems`とsession itemsはexact希望数、少ない場合だけ両方をexact eligible countとし、利用者が実数を確認してから開始する。session itemはDB保存済みbasis itemからだけ生成し、任意underfill・差替えを拒否する。question/versionは重複禁止。
- 0 itemを拒否する。canonicalの`actualQuestionCount`は`items.length`と一致する。
- DBはbasisに固定したsession ID、mode、資格、syllabus、selection specと、unanswered/weak/bookmark/wrong/review-due membershipをappend-only event/change履歴から再構築して検証する。7/30/90日windowとreview dueは端末時計でなく保存済み`issuedAt`のDB時刻を基準にする。basisは物理削除・時刻失効させず、他人、future、別session、入力spec不一致、または候補集合hash/選定結果を再現不能なら`SELECTION_BASIS_UNVERIFIABLE`で全件拒否する。
- selection basisのchannel/assurance/preview acceptanceはsession requestと完全一致しなければならない。
- selection basisのsession ID、mode、資格、syllabus、希望数、selection spec、`catalogRevision`、`dataGeneration`もrequest/envelopeと完全一致しなければならない。weakを含む全sourceはversion付きalgorithm registryの同一digestを使い、score入力、乱数seedの導出規則、tie-break（question stable ID昇順）をbasisへ固定する。
- mode/sourceを固定対応させる: `chapter`はscopeのchapter/LOが1件以上、`wrong`はsource wrong、`review`はsource review-due、`random`はrandom/unanswered/weak/bookmarkを許可する。追加のbookmarkOnly/difficulty/scopeは全sourceにAND条件で適用する。
- `public`では、DBは指定資格・syllabusで要求versionが指定`catalogRevision`時点に配信可能だったことをappend-only catalog change履歴から検証する。現在retired/replacedだがsuspendedでない版はhistoric pinとしてそのまま受理する。
- `personal_preview`ではowner本人、activeなimmutable acceptance snapshot、同じbundle/canonical/manifest hashのstaged import、reviewing版を検証する。requestの`previewAcceptanceId`と`previewSelectionRevision`をsessionへ固定し、`contentAssurance='owner_preview'`とする。`public`では両fieldをnull以外にできない。
- choiceOrderは対象版のsafe choice ID完全順列でなければならない。別versionへ黙って置換しない。
- 現在suspendedの版はitemを`INVALIDATED`としてpinし、回答・誤答・SRSへ反映しない。履歴で配信可能性を検証できない場合は`SESSION_SNAPSHOT_UNVERIFIABLE`で全件拒否し、local回答を削除しない。
- online `LOCAL_CREATING`の`session.created`は通常ingestのsingleton batch、offline-pack `LOCAL_CREATING`は専用consume RPCのsingleton commandとして先に送る。後者を通常ingestへ送った場合は拒否する。canonical適用後、invalidated itemに依存する未送信draft/answerを`SUPERSEDED_SERVER_INVALIDATED`へ移し、残るactive itemだけを後続batchで送る。既にserver作成済みsessionが後からsuspendされた場合は§3.2/3.3のinvalidated canonicalでACKする。
- 模試はclientから問題IDを受けず、DBがblueprintにより40問を選ぶ。
- `personal_preview`模試はactive acceptanceのowner本人だけを許可し、同acceptance overlayからblueprint exact 40問を選ぶ。session、terminal、result、feedbackへacceptanceと全hashを固定し、published正式合格・SRS・分析へ一切混入させない。acceptance revoke時はsessionをinvalidatedへ収束させる。
- 新規模試はonline開始必須。開始済みpinのoffline再開だけを許可する。模試開始・期限はDB時計で決める。
- `verified_only`は正式結果だけ、`allow_offline_reference`は正式結果に加え専用RPCの参考結果を許可する。両policyとも新規開始はonline必須。
- `learning_sessions.exam_policy`とcanonical/owned/local snapshotへ開始transactionで固定し、通常演習はnull、模試は非nullとする。再開、submit、finalizer、offline referenceは保存値だけを参照し、clientの後続入力で変更できない。

### 3.2 `draft.saved`

```ts
interface DraftSavedRequest {
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly scrollOffset: number;
  readonly expectedRevision: number;
  readonly deviceId: string;
}

type DraftSavedCanonical =
  | (DraftSavedRequest & {
      readonly questionVersionId: QuestionVersionId;
      readonly revision: number;
      readonly updatedAt: IsoUtcTimestamp;
      readonly disposition: 'saved';
      readonly invalidated: false;
      readonly invalidatedReason: null;
      readonly supersededByAttemptId: null;
      readonly supersededByAttemptHash: null;
    })
  | (DraftSavedRequest & {
      readonly questionVersionId: QuestionVersionId;
      readonly revision: number;
      readonly updatedAt: IsoUtcTimestamp | null;
      readonly disposition: 'invalidated';
      readonly invalidated: true;
      readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked' | 'exam_input_closed';
      readonly supersededByAttemptId: null;
      readonly supersededByAttemptHash: null;
    })
  | (DraftSavedRequest & {
      readonly questionVersionId: QuestionVersionId;
      readonly revision: number;
      readonly updatedAt: IsoUtcTimestamp | null;
      readonly disposition: 'superseded-by-answer';
      readonly invalidated: false;
      readonly invalidatedReason: null;
      readonly supersededByAttemptId: UUID;
      readonly supersededByAttemptHash: Sha256HexV1;
    });
```

- `entityId === "${sessionId}:${questionId}"`。
- 空選択を許可する。
- choice数はrequired choice count以下。
- choiceはpin版所属でなければならない。
- revision不一致は`REVISION_CONFLICT`。
- 通常演習ではuser shared lock、question-version shared lock、session row、session itemの順に取得した後、draft revisionを比較・更新する前に`effective_answer_attempts`を検査します。同じsession/itemへ有効attemptが存在する場合はdraft行をINSERT/UPDATEせず、既存draftの`revision/updatedAt`（行なしは`0/null`）と実効attempt ID/hashを持つ`disposition='superseded-by-answer'`を成功canonical ACKとしてappendします。clientから送られたdraft値で既存draftを上書きせず、attempt成立後のstale draftを`REVISION_CONFLICT`やterminal errorへ変換しません。
- clientは`superseded-by-answer`を受けたlocal transactionでACKを保存し、当該draft outboxを`SUPERSEDED`、同itemのpending draft/answerとdraft conflictを削除し、`supersededByAttemptId/supersededByAttemptHash`に完全一致するcanonical attemptを表示します。attempt hashは`SHA-256(RFC 8785 JCS(append-only canonical attempt fact))`で、ID一致・hash不一致も適用せずquarantineしてsync pull/bootstrapを要求します。matching canonical attemptがlocalにも同response/pullにも存在しない場合もACKを適用しません。同じevent ID・同じrequest hashの再送は初回のsequence、canonical hash、attempt ID/hash、既存draft revision/timeをbyte-for-byte返し、異内容は`IDEMPOTENCY_KEY_REUSED`です。
- 模試でversion shared lockとsession row lock取得後のDB wall-clockが期限後なら、materialized draftをINSERT/UPDATEせず、同一eventを`invalidatedReason='exam_input_closed'`のcanonicalとしてappend・ACKし、同じtransactionでverified finalizerを確定する。これはPostgreSQL exceptionではなく成功responseであり、clientはoutboxをACKしてterminal stateを適用する。
- `invalidated=false`の`revision/updatedAt`は、このeventでcommitしたmaterialized draftの新revisionとDB受信時刻です。`invalidated=true`ではmaterialized rowを変更せず、`revision`はlock下で読んだ既存draft revision（行なしは0）、`updatedAt`は既存rowのimmutable最終更新時刻（行なしはnull）です。拒否event自身の時刻はcanonical envelopeの`receivedAt`だけを正本とし、client時刻から補いません。

### 3.3 `answer.submitted`

```ts
interface AnswerSubmittedRequest {
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
}

type AnswerSubmittedCanonical =
  | (AnswerSubmittedRequest & {
      readonly isCorrect: boolean;
      readonly answeredAt: IsoUtcTimestamp;
      readonly contentAssurance: ContentAssurance;
      readonly previewAcceptanceId: UUID | null;
      readonly invalidated: false;
      readonly invalidatedReason: null;
    })
  | (AnswerSubmittedRequest & {
      readonly isCorrect: null;
      readonly answeredAt: IsoUtcTimestamp;
      readonly contentAssurance: ContentAssurance;
      readonly previewAcceptanceId: UUID | null;
      readonly invalidated: true;
      readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked';
    });
```

- `entityId`はattempt UUID。
- 通常演習専用。模試では使用しない。
- 選択数はrequired countと一致必須。
- DB answer keyとの集合完全一致だけを正解とする。
- 同じsession/questionの有効attemptは一件だけ。
- `entityId === eventId`とし、event IDをattempt IDに使用する。
- offline中にsuspendedとなったpin版はselected履歴をappendし、同transactionでinvalidationをappendしてcanonical `invalidated=true`をACKする。正答を計算・返却せず、question state/SRS/scoreを更新しない。
- 通常演習は全active itemに有効attemptがある時だけremote `completed`とする。作成時または途中停止でanswerable itemが0になれば理由付き`invalidated`、一部停止なら停止itemを除いた実分母で完了する。clientは未ACK回答が残る間`COMPLETION_PENDING`を表示する。

### 3.4 `session.advanced`

```ts
interface SessionAdvancedRequest {
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly expectedRevision: number;
}

interface SessionAdvancedCanonical extends SessionAdvancedRequest {
  readonly currentIndex: number;
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
}
```

`entityId === sessionId`です。`currentIndex`は移動先itemのordinalです。

### 3.5 `session.submitted`

```ts
interface ExamAttemptSummaryDto {
  readonly attemptId: UUID | null;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: number;
  readonly answered: boolean;
  readonly excluded: boolean;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly isCorrect: boolean | null;
  readonly score: 0 | 1 | null;
}

interface SessionSubmittedCanonical {
  readonly sessionId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly examPolicy: ExamPolicy;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly revision: number;
  readonly resultRevision: number;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly submittedAt: IsoUtcTimestamp;
  readonly answeredQuestionIds: readonly QuestionId[];
  readonly expired: boolean;
  readonly timingAssurance: 'verified';
  readonly resultStatus: 'valid' | 'invalidated';
  readonly score: number;
  readonly denominator: number;
  readonly passingScore: 26 | null;
  readonly passed: boolean | null;
  readonly itemResults: readonly ExamAttemptSummaryDto[];
}
```

- 模試専用。
- server保存済みの完全draftを採点する。
- 未回答・部分回答は0点。
- suspendedはexcludedとし分母から除外する。分母が40未満なら`passed=null`、`resultStatus='invalidated'`で、verified分析へ算入しない。
- 全item result、attempt、学習状態、session、sync eventを一transactionで確定する。
- canonical terminal一件だけでclient結果を再構築できる。
- `entityId === sessionId`。

### 3.6 `session.review-marked`

```ts
interface SessionReviewMarkedRequest {
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly marked: boolean;
  readonly expectedRevision: number;
}

interface SessionReviewMarkedCanonical
  extends SessionReviewMarkedRequest {
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
}
```

`entityId === "${sessionId}:${questionId}"`。

### 3.7 `bookmark.changed`

```ts
interface BookmarkChangedRequest {
  readonly questionId: QuestionId;
  readonly enabled: boolean;
}

interface BookmarkChangedCanonical
  extends BookmarkChangedRequest {
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
}
```

server受信順のlast-write-winsとします。

`occurredAt`をlast-write-winsへ使用しません。DBが付与するsequenceだけを順序の正本にします。

`entityId === questionId`。

### 3.8 `note.saved`

```ts
interface NoteSavedRequest {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly body: string;
  readonly expectedRevision: number;
}

interface NoteSavedCanonical extends NoteSavedRequest {
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
}
```

`entityId === questionId`。

### 3.9 `issue.reported`

```ts
interface IssueReportedRequest {
  readonly issueId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly category: ContentIssueCategory;
  readonly description: string;
}

interface IssueReportedCanonical extends IssueReportedRequest {
  readonly createdAt: IsoUtcTimestamp;
  readonly revision: 1;
  readonly status: 'open';
  readonly resolution: null;
  readonly updatedAt: IsoUtcTimestamp;
}
```

`entityId === issueId`で、報告はappend-onlyです。

### 3.10 Payload map

```ts
interface ClientSyncRequestPayloadMap {
  readonly 'session.created': SessionCreatedRequest;
  readonly 'draft.saved': DraftSavedRequest;
  readonly 'answer.submitted': AnswerSubmittedRequest;
  readonly 'session.advanced': SessionAdvancedRequest;
  readonly 'session.review-marked': SessionReviewMarkedRequest;
  readonly 'bookmark.changed': BookmarkChangedRequest;
  readonly 'note.saved': NoteSavedRequest;
  readonly 'issue.reported': IssueReportedRequest;
}

interface SyncCanonicalPayloadMap {
  readonly 'session.created': SessionCreatedCanonical;
  readonly 'draft.saved': DraftSavedCanonical;
  readonly 'answer.submitted': AnswerSubmittedCanonical;
  readonly 'session.advanced': SessionAdvancedCanonical;
  readonly 'session.submitted': SessionSubmittedCanonical;
  readonly 'session.review-marked': SessionReviewMarkedCanonical;
  readonly 'bookmark.changed': BookmarkChangedCanonical;
  readonly 'note.saved': NoteSavedCanonical;
  readonly 'issue.reported': IssueReportedCanonical;
}
```

### 3.11 Field上限とsemantic invariant

| 対象 | 制約 |
|---|---|
| title | 1～80 Unicode scalar、trim後空禁止 |
| certificationCode / syllabusVersion / examBlueprintVersion | 1～64 ASCII allowlist |
| normal basis/session items | candidate不足時だけ1～requestedQuestionCount件、それ以外は希望数exact。question/version一意、choiceOrder 2～8件一意。0件拒否 |
| exam items | requestでは禁止、canonicalはexact 40件 |
| selectedChoiceIds | 0～8件一意、確定回答はrequired count exact |
| deviceId | 1～128文字。認可には使用しない |
| body | note 0～10,000文字 |
| description | issue 1～2,000文字 |
| expectedRevision / revision | safe integer、0以上 |
| ordinal / currentIndex | 0始まり、session items内の実ordinalと一致 |

すべてのsession系eventはowner、remote status、mode、pinned question/versionを検証します。`session.submitted`はexamだけ、`answer.submitted`はnon-examだけです。通常演習で既に有効attemptが存在する`draft.saved`の`superseded-by-answer`成功ACKと、期限後模試draftの`exam_input_closed`成功ACKだけを例外とし、completed/abandoned/invalidated後のdraft、answer、advanced、reviewを拒否します。entityIdは各節の式と完全一致し、serverはclient値から別entityを推測しません。

## 4. Error契約

PostgreSQL exceptionのmessageは機械判定用code、transport `detail`は正答・他利用者情報を含まない内部診断JSON、hintは任意の日本語文とします。transport `detail`はlogのredaction対象であり、公開responseの`RpcErrorDto.detail`へ転記しません。公開`detail`は以下のstrict unionだけを正本とし、現v2では全branchでliteral `null`です。

```ts
type RpcErrorCode =
  | 'AUTH_REQUIRED'
  | 'RESOURCE_FORBIDDEN'
  | 'INVALID_ENVELOPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'FEATURE_NOT_AVAILABLE'
  | 'STALE_DATA_GENERATION'
  | 'RESTORE_IN_PROGRESS'
  | 'RESTORE_TARGET_NOT_EMPTY'
  | 'BOOTSTRAP_SNAPSHOT_EXPIRED'
  | 'BOOTSTRAP_PAGE_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CATALOG_STALE'
  | 'SESSION_SNAPSHOT_UNVERIFIABLE'
  | 'SELECTION_BASIS_UNVERIFIABLE'
  | 'SESSION_FROZEN'
  | 'QUESTION_VERSION_MISMATCH'
  | 'QUESTION_SUSPENDED'
  | 'PREVIEW_ACCEPTANCE_INACTIVE'
  | 'INVALID_CHOICE_SELECTION'
  | 'REVISION_CONFLICT'
  | 'ANSWER_ALREADY_COMMITTED'
  | 'EXAM_BLUEPRINT_MISMATCH'
  | 'EXAM_NOT_SUBMITTABLE'
  | 'CATALOG_REVISION_AHEAD'
  | 'PREVIEW_SELECTION_CONFLICT'
  | 'FEEDBACK_ANSWER_REQUIRED'
  | 'FEEDBACK_EXAM_NOT_SUBMITTED'
  | 'CONTENT_OPERATION_FORBIDDEN'
  | 'ATTESTATION_HASH_MISMATCH'
  | 'ATTESTATION_REVOKE_FORBIDDEN'
  | 'CONTENT_RELEASE_ALREADY_PUBLISHED'
  | 'OWNER_REVIEW_STATE_CONFLICT'
  | 'OWNER_REVIEW_ISSUE_INVALID'
  | 'PROJECTION_SNAPSHOT_EXPIRED'
  | 'RELEASE_ATTESTATION_GATE_FAILED'
  | 'RELEASE_CANONICAL_HASH_MISMATCH'
  | 'REAUTH_REQUIRED'
  | 'REAUTH_EXPIRED'
  | 'REAUTH_ALREADY_USED'
  | 'JOB_CONFLICT'
  | 'RESTORE_MANIFEST_INVALID';

interface RevisionConflictDto {
  readonly aggregateKey: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;
  readonly remotePayload:
    | { readonly kind: 'draft.saved'; readonly value: DraftSavedCanonical }
    | { readonly kind: 'note.saved'; readonly value: NoteSavedCanonical }
    | { readonly kind: 'session.advanced'; readonly value: SessionAdvancedCanonical }
    | { readonly kind: 'session.review-marked'; readonly value: SessionReviewMarkedCanonical };
}

interface AnswerConflictDto {
  readonly disposition: 'same-intent' | 'different-intent';
  readonly attemptId: UUID;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly isCorrect: boolean | null;
  readonly answeredAt: IsoUtcTimestamp;
}

interface PreviewSelectionConflictDto {
  readonly acceptanceId: UUID;
  readonly expectedSelectionRevision: NonNegativeSafeIntegerV1;
  readonly actualSelectionRevision: NonNegativeSafeIntegerV1;
}

type RpcErrorNoContextShapeV2 = {
  readonly retryable: false;
  readonly entityId: null;
  readonly detail: null;
  readonly conflict: null;
};

type RpcErrorEntityShapeV2 = {
  readonly retryable: false;
  readonly entityId: NonEmptyTrimmedStringV1;
  readonly detail: null;
  readonly conflict: null;
};

type RpcErrorRetryableEntityShapeV2 = {
  readonly retryable: true;
  readonly entityId: NonEmptyTrimmedStringV1;
  readonly detail: null;
  readonly conflict: null;
};

interface RpcErrorShapeMapV2 {
  readonly AUTH_REQUIRED: RpcErrorNoContextShapeV2;
  readonly RESOURCE_FORBIDDEN: RpcErrorNoContextShapeV2;
  readonly INVALID_ENVELOPE: RpcErrorNoContextShapeV2;
  readonly PAYLOAD_TOO_LARGE: RpcErrorNoContextShapeV2;
  readonly IDEMPOTENCY_KEY_REUSED: RpcErrorEntityShapeV2;
  readonly FEATURE_NOT_AVAILABLE: RpcErrorNoContextShapeV2;
  readonly STALE_DATA_GENERATION: RpcErrorNoContextShapeV2;
  readonly RESTORE_IN_PROGRESS: RpcErrorRetryableEntityShapeV2;
  readonly RESTORE_TARGET_NOT_EMPTY: RpcErrorEntityShapeV2;
  readonly BOOTSTRAP_SNAPSHOT_EXPIRED: RpcErrorRetryableEntityShapeV2;
  readonly BOOTSTRAP_PAGE_INVALID: RpcErrorEntityShapeV2;
  readonly SESSION_NOT_FOUND: RpcErrorEntityShapeV2;
  readonly SESSION_CATALOG_STALE: RpcErrorEntityShapeV2;
  readonly SESSION_SNAPSHOT_UNVERIFIABLE: RpcErrorEntityShapeV2;
  readonly SELECTION_BASIS_UNVERIFIABLE: RpcErrorEntityShapeV2;
  readonly SESSION_FROZEN: RpcErrorEntityShapeV2;
  readonly QUESTION_VERSION_MISMATCH: RpcErrorEntityShapeV2;
  readonly QUESTION_SUSPENDED: RpcErrorEntityShapeV2;
  readonly PREVIEW_ACCEPTANCE_INACTIVE: RpcErrorEntityShapeV2;
  readonly INVALID_CHOICE_SELECTION: RpcErrorEntityShapeV2;
  readonly REVISION_CONFLICT: {
    readonly retryable: false;
    readonly entityId: NonEmptyTrimmedStringV1;
    readonly detail: null;
    readonly conflict: RevisionConflictDto;
  };
  readonly ANSWER_ALREADY_COMMITTED: {
    readonly retryable: false;
    readonly entityId: NonEmptyTrimmedStringV1;
    readonly detail: null;
    readonly conflict: AnswerConflictDto;
  };
  readonly EXAM_BLUEPRINT_MISMATCH: RpcErrorEntityShapeV2;
  readonly EXAM_NOT_SUBMITTABLE: RpcErrorEntityShapeV2;
  readonly CATALOG_REVISION_AHEAD: RpcErrorEntityShapeV2;
  readonly PREVIEW_SELECTION_CONFLICT: {
    readonly retryable: false;
    readonly entityId: NonEmptyTrimmedStringV1;
    readonly detail: null;
    readonly conflict: PreviewSelectionConflictDto;
  };
  readonly FEEDBACK_ANSWER_REQUIRED: RpcErrorEntityShapeV2;
  readonly FEEDBACK_EXAM_NOT_SUBMITTED: RpcErrorEntityShapeV2;
  readonly CONTENT_OPERATION_FORBIDDEN: RpcErrorEntityShapeV2;
  readonly ATTESTATION_HASH_MISMATCH: RpcErrorEntityShapeV2;
  readonly ATTESTATION_REVOKE_FORBIDDEN: RpcErrorEntityShapeV2;
  readonly CONTENT_RELEASE_ALREADY_PUBLISHED: RpcErrorEntityShapeV2;
  readonly OWNER_REVIEW_STATE_CONFLICT: RpcErrorEntityShapeV2;
  readonly OWNER_REVIEW_ISSUE_INVALID: RpcErrorEntityShapeV2;
  readonly PROJECTION_SNAPSHOT_EXPIRED: RpcErrorEntityShapeV2;
  readonly RELEASE_ATTESTATION_GATE_FAILED: RpcErrorEntityShapeV2;
  readonly RELEASE_CANONICAL_HASH_MISMATCH: RpcErrorEntityShapeV2;
  readonly REAUTH_REQUIRED: RpcErrorEntityShapeV2;
  readonly REAUTH_EXPIRED: RpcErrorEntityShapeV2;
  readonly REAUTH_ALREADY_USED: RpcErrorEntityShapeV2;
  readonly JOB_CONFLICT: RpcErrorEntityShapeV2;
  readonly RESTORE_MANIFEST_INVALID: RpcErrorEntityShapeV2;
}

type RpcErrorDto = {
  [C in RpcErrorCode]: { readonly code: C } & RpcErrorShapeMapV2[C];
}[RpcErrorCode];
```

`RpcErrorDto`は`code`をdiscriminatorとするstrict unionです。全branchで`retryable/entityId/detail/conflict`の4 field自体を必須にし、禁止値はfield省略でなくliteral `null`へ固定します。`retryable=true`は`RESTORE_IN_PROGRESS`と`BOOTSTRAP_SNAPSHOT_EXPIRED`だけです。`REVISION_CONFLICT`、`ANSWER_ALREADY_COMMITTED`、`PREVIEW_SELECTION_CONFLICT`だけが各専用`conflict`をnon-nullで持ち、他codeへのconflict、任意record detail、`details`や`isRetryable`等の別名、未知・余剰fieldを拒否します。`RESOURCE_FORBIDDEN`は対象存在を推測させないためentity IDを返しません。

主要code:

| code | 意味 | 自動再試行 |
|---|---|---:|
| `AUTH_REQUIRED` | 認証なし・期限切れ | いいえ |
| `RESOURCE_FORBIDDEN` | 他利用者または権限外 | いいえ |
| `INVALID_ENVELOPE` | envelope/schema不正 | いいえ |
| `PAYLOAD_TOO_LARGE` | event/batch上限超過 | いいえ |
| `IDEMPOTENCY_KEY_REUSED` | 同event ID異内容 | いいえ |
| `FEATURE_NOT_AVAILABLE` | migration/cutover/feature gate未成立 | いいえ |
| `STALE_DATA_GENERATION` | restore後の旧端末generation | いいえ |
| `RESTORE_IN_PROGRESS` | 本人データのrestore排他中 | はい |
| `RESTORE_TARGET_NOT_EMPTY` | P0復元先の学習namespaceが空でない | いいえ |
| `BOOTSTRAP_SNAPSHOT_EXPIRED` | bootstrap snapshotが15分期限を超過 | はい（新snapshot発行） |
| `BOOTSTRAP_PAGE_INVALID` | section/scope/page/hash/count不一致 | いいえ |
| `SESSION_NOT_FOUND` | owner sessionなし | いいえ |
| `SESSION_CATALOG_STALE` | catalog revisionが未来、またはchannel/current条件不一致 | いいえ |
| `SESSION_SNAPSHOT_UNVERIFIABLE` | 指定revisionで配信可能だった版を証明不能 | いいえ |
| `SELECTION_BASIS_UNVERIFIABLE` | user state basis sequenceのmembershipを証明不能 | いいえ |
| `SESSION_FROZEN` | 完了・期限後・受付停止 | いいえ |
| `QUESTION_VERSION_MISMATCH` | pin版不一致 | いいえ |
| `QUESTION_SUSPENDED` | 緊急停止 | いいえ |
| `INVALID_CHOICE_SELECTION` | choice所属・数・重複不正 | いいえ |
| `REVISION_CONFLICT` | draft/note/session CAS競合 | いいえ |
| `ANSWER_ALREADY_COMMITTED` | 別eventで有効attempt確定済み | いいえ |
| `EXAM_BLUEPRINT_MISMATCH` | 40問・章・K等不一致 | いいえ |
| `EXAM_NOT_SUBMITTABLE` | 模試でない・提出済み | いいえ |
| `CATALOG_REVISION_AHEAD` | client revisionが未来 | いいえ |
| `PREVIEW_ACCEPTANCE_INACTIVE` | preview acceptanceがactiveでない・取消済み | いいえ |
| `PREVIEW_SELECTION_CONFLICT` | preview切替revision競合 | いいえ |
| `FEEDBACK_ANSWER_REQUIRED` | 通常問題未確定 | いいえ |
| `FEEDBACK_EXAM_NOT_SUBMITTED` | 模試未提出 | いいえ |
| `CONTENT_OPERATION_FORBIDDEN` | 管理権限不足 | いいえ |
| `ATTESTATION_HASH_MISMATCH` | 承認対象hash不一致 | いいえ |
| `ATTESTATION_REVOKE_FORBIDDEN` | 他人の承認取消 | いいえ |
| `CONTENT_RELEASE_ALREADY_PUBLISHED` | 公開済みreleaseのattestation取消は禁止。事故対応はsuspend、内容変更は新release | いいえ |
| `OWNER_REVIEW_STATE_CONFLICT` | owner reviewの状態・revision・直前fact hashがcurrentと不一致 | いいえ（safe resumeを再取得） |
| `OWNER_REVIEW_ISSUE_INVALID` | changes_required issueのcategory/reason/content ref結合が不正 | いいえ |
| `PROJECTION_SNAPSHOT_EXPIRED` | projection snapshotがDB時計で期限到達済み | いいえ（新projectionを取得） |
| `RELEASE_ATTESTATION_GATE_FAILED` | 承認不足 | いいえ |
| `RELEASE_CANONICAL_HASH_MISMATCH` | 公開直前hash不一致 | いいえ |
| `REAUTH_REQUIRED` | IdP credential再検証が必要 | いいえ |
| `REAUTH_EXPIRED` | reauth grant期限切れ | いいえ |
| `REAUTH_ALREADY_USED` | one-time grant再利用 | いいえ |
| `JOB_CONFLICT` | 同一jobの競合操作 | いいえ |
| `RESTORE_MANIFEST_INVALID` | export署名・hash・owner・schema不正 | いいえ |

通信、timeout、5xxに加え、strict error branchで`retryable=true`の`RESTORE_IN_PROGRESS`と`BOOTSTRAP_SNAPSHOT_EXPIRED`だけを規定backoffまたは新snapshot発行で自動再試行します。その他のRPC errorは自動再試行しません。

`ANSWER_ALREADY_COMMITTED`では新eventのsync rowを作らずACKしません。clientは`same-intent`ならlocal outboxを`SUPERSEDED`へ、`different-intent`なら`CONFLICT`へ遷移させます。

## 5. Safe catalog RPC

```sql
public.get_question_catalog_v2(
  p_data_generation bigint,
  p_certification_code text,
  p_syllabus_version text,
  p_since_revision bigint default null,
  p_channel text default 'public',
  p_preview_acceptance_id uuid default null,
  p_preview_selection_revision bigint default null
)
returns jsonb
```

```ts
interface CatalogChoiceDto {
  readonly id: ChoiceId;
  readonly label: string;
  readonly body: string;
  readonly sortOrder: number;
}

interface PreAnswerQuestionBaseDto {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly versionNo: PositiveSafeIntegerV1;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly contentAssurance: ContentAssurance;
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly learningObjectiveTitle: string;
  readonly kLevel: 1 | 2 | 3;
  readonly cognitiveOperation: CognitiveOperationV1;
  readonly patternFamilyId: `${LearningObjectiveCodeV1}:pf${PatternFamilyOrdinalV1}`;
  readonly questionForm: QuestionFormV1;
  readonly difficulty: 1 | 2 | 3;
  readonly examEligibility: 'eligible' | 'practice-only';
  readonly shuffleChoices: boolean;
  readonly prompt: string;
  readonly choices: readonly CatalogChoiceDto[];
}

type PreAnswerQuestionDto = PreAnswerQuestionBaseDto & (
  | { readonly selectionType: 'single'; readonly requiredChoiceCount: 1 }
  | { readonly selectionType: 'multiple'; readonly requiredChoiceCount: 2 }
);

interface CatalogTombstoneDto {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly revision: number;
  readonly reason: 'retired' | 'suspended' | 'replaced';
}

interface QuestionCatalogResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly channel: ContentChannel;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly mode: 'full' | 'delta';
  readonly fullResetRequired: boolean;
  readonly revision: number;
  readonly etag: string;
  readonly upserts: readonly PreAnswerQuestionDto[];
  readonly tombstones: readonly CatalogTombstoneDto[];
}
```

禁止key:

```text
isCorrect
correctChoiceIds
answerKey
explanation
choiceExplanation
takeaway
commonTrap
```

`public` global catalogはcurrent publishedだけを返し、preview関連5fieldはnullです。`personal_preview`はowner本人に限り、activeなimmutable acceptance snapshotと同じbundle ID/canonical/manifest hashを持つstaged importのreviewing currentとpublishedを返せます。acceptanceはID、owner、bundle、raw/canonical/manifest hash、accepted version ID集合、accepted_at、revocationをappend-onlyで固定し、内容差替えや`ON CONFLICT UPDATE`を許しません。preview版ID、件数、本文は他owner・一般authenticated・anonへ一切返しません。retired/suspended pin版は次の所有session RPCで取得します。

`sinceRevision=null`はfullです。`mode='full'`はchannel内のcurrentを全件返し、`mode='delta'`は`sinceRevision < change.revision <= revision`のupsert/tombstoneだけを返します。etag/revision同値なら空delta、保持開始revisionより古ければ`fullResetRequired=true`のfullを返します。同revisionの再取得は同じetag/contentです。personal previewのrequest acceptance/selection revisionが現在active selectionと異なる場合は、差分を返さず現在selectionの`fullResetRequired=true` fullへ切り替えます。clientは全変更、generation、revisionを一local transactionで適用します。public cache keyは`(userId, dataGeneration, certificationCode, syllabusVersion, channel)`、preview cache keyはこれに`previewAcceptanceId`、`previewBundleId`、`previewCanonicalHash`、`previewManifestHash`、`previewSelectionRevision`を加えます。acceptance revoke/hash変更は旧preview cacheをpurgeし、active sessionはserver lifecycle deltaでinvalidatedへ収束させます。logout・利用者切替時にpreview cacheを即時unloadします。このRPCのEXECUTEは`authenticated`だけにgrantし、`anon`と`service_role`へはgrantしません。

## 6. 所有Session RPC

### 6.1 一覧

```sql
public.get_owned_learning_sessions_v2(
  p_data_generation bigint,
  p_statuses text[] default array['active'],
  p_limit integer default 50,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
```

```ts
interface OwnedSessionSummaryDto {
  readonly sessionId: UUID;
  readonly mode: LearningMode;
  readonly title: string;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy | null;
  readonly selectionBasisId: UUID | null;
  readonly catalogRevision: number;
  readonly selectionSpec: NormalSelectionSpecV2 | null;
  readonly examBlueprintVersion: string | null;
  readonly examBlueprintHash: Sha256HexV1 | null;
  readonly status: SessionStatus;
  readonly questionCount: number;
  readonly answeredCount: number;
  readonly currentIndex: number;
  readonly currentQuestionId: QuestionId | null;
  readonly startedAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp | null;
  readonly submittedAt: IsoUtcTimestamp | null;
  readonly completedAt: IsoUtcTimestamp | null;
}

interface OwnedSessionListResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly items: readonly OwnedSessionSummaryDto[];
  readonly nextCursor: { readonly updatedAt: IsoUtcTimestamp; readonly sessionId: UUID } | null;
}
```

sortは`updated_at DESC, id DESC`、limitは1～100です。

### 6.2 再開詳細

```sql
public.get_owned_learning_session_v2(p_data_generation bigint, p_session_id uuid)
returns jsonb
```

```ts
interface SessionDraftDto {
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly scrollOffset: number;
  readonly revision: number;
  readonly deviceId: string;
  readonly updatedAt: IsoUtcTimestamp;
}

interface OwnedSessionItemDto {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: number;
  readonly choiceOrder: readonly ChoiceId[];
  readonly answered: boolean;
  readonly reviewMarked: boolean;
  readonly status: 'active' | 'invalidated';
  readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked' | null;
  readonly draft: SessionDraftDto | null;
  readonly content: OwnedPinnedContentDto;
}

type OwnedPinnedContentDto =
  | ({
      readonly visibility: 'available';
      readonly status: 'published' | 'retired' | 'reviewing';
      readonly certificationCode: string;
      readonly syllabusVersion: string;
      readonly chapterNumber: number;
      readonly chapterTitle: string;
      readonly sectionCode: string;
      readonly sectionTitle: string;
      readonly learningObjectiveCode: LearningObjectiveCodeV1;
      readonly learningObjectiveTitle: string;
      readonly kLevel: 1 | 2 | 3;
      readonly cognitiveOperation: CognitiveOperationV1;
      readonly patternFamilyId: `${LearningObjectiveCodeV1}:pf${PatternFamilyOrdinalV1}`;
      readonly questionForm: QuestionFormV1;
      readonly difficulty: 1 | 2 | 3;
      readonly examEligibility: 'eligible' | 'practice-only';
      readonly shuffleChoices: boolean;
      readonly prompt: string;
      readonly choices: readonly CatalogChoiceDto[];
    } & (
      | { readonly selectionType: 'single'; readonly requiredChoiceCount: 1 }
      | { readonly selectionType: 'multiple'; readonly requiredChoiceCount: 2 }
    ))
  | ({
      readonly visibility: 'compatibility-only';
      readonly status: 'compatibility_only';
      readonly certificationCode: string;
      readonly syllabusVersion: string;
      readonly prompt: string;
      readonly choices: readonly CatalogChoiceDto[];
    } & (
      | { readonly selectionType: 'single'; readonly requiredChoiceCount: 1 }
      | { readonly selectionType: 'multiple'; readonly requiredChoiceCount: 2 }
    ))
  | {
      readonly visibility: 'suspended-tombstone';
      readonly status: 'suspended';
      readonly prompt: null;
      readonly choices: readonly [];
    }
  | {
      readonly visibility: 'acceptance-revoked-tombstone';
      readonly priorStatus: 'reviewing' | 'published' | 'retired';
      readonly prompt: null;
      readonly choices: readonly [];
    };

interface OwnedLearningSessionResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly sessionId: UUID;
  readonly mode: LearningMode;
  readonly title: string;
  readonly status: SessionStatus;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy | null;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly selectionBasisId: UUID | null;
  readonly catalogRevision: number;
  readonly selectionSpec: NormalSelectionSpecV2 | null;
  readonly examBlueprintVersion: string | null;
  readonly examBlueprintHash: Sha256HexV1 | null;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly actualQuestionCount: number;
  readonly answerableQuestionCount: number;
  readonly currentIndex: number;
  readonly revision: number;
  readonly startedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp | null;
  readonly submittedAt: IsoUtcTimestamp | null;
  readonly completedAt: IsoUtcTimestamp | null;
  readonly items: readonly OwnedSessionItemDto[];
}
```

このRPCはowner、資格、syllabus、channel、pin版を検証し、正答・解説を返しません。同じquestionのcurrent版とretired pin版をquestion IDだけで統合しません。owner preview sessionに限り、固定済みreviewing版を再開できます。

`legacy_compatibility`はM1が既存18問sessionを移行した場合の再開専用です。`OwnedPinnedContentDto.visibility='compatibility-only'`として明示し、新規selection basis、session、模試、global catalog、owner preview、正式SRS・分析・500問countへ使用しません。互換sessionの履歴は保持しますが、回答は互換履歴namespaceへ隔離します。

global catalog cacheが空のcold startでもこのallowlistだけで回答画面を構築できます。retired pinのcold resume、suspended tombstone、禁止key 0をcontract/E2Eで検証します。

### 6.3 端末pre-answer snapshotとserver portable export

```ts
interface LocalSessionRecordV2 {
  readonly schemaVersion: 2;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly sessionId: UUID;
  readonly mode: LearningMode;
  readonly title: string;
  readonly localStatus:
    | 'LOCAL_CREATING'
    | 'ACTIVE'
    | 'SUBMITTING'
    | 'COMPLETION_PENDING'
    | 'SYNC_CONFLICT'
    | 'COMPLETED'
    | 'ABANDONED'
    | 'INVALIDATED';
  readonly remoteStatus: SessionStatus | null;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy | null;
  readonly selectionBasisId: UUID | null;
  readonly catalogRevision: number;
  readonly selectionSpec: NormalSelectionSpecV2 | null;
  readonly examBlueprintVersion: string | null;
  readonly examBlueprintHash: Sha256HexV1 | null;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly localCurrentIndex: number;
  readonly remoteCurrentIndex: number | null;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly actualQuestionCount: number;
  readonly answerableQuestionCount: number;
  readonly localRevision: number;
  readonly localUpdatedAt: IsoUtcTimestamp;
  readonly remoteRevision: number | null;
  readonly remoteUpdatedAt: IsoUtcTimestamp | null;
  readonly remoteSource: LocalRemoteSourceMetadataV2 | null;
  readonly startedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp | null;
  readonly items: readonly {
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly ordinal: number;
    readonly choiceOrder: readonly ChoiceId[];
    readonly state: 'unanswered' | 'pending' | 'answered' | 'invalidated';
    readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked' | null;
    readonly reviewMarked: boolean;
    readonly content: OwnedPinnedContentDto;
    readonly draft: SessionDraftDto | null;
    readonly pendingAnswerEventId: UUID | null;
    readonly canonicalAttemptId: UUID | null;
  }[];
}

type LocalOutboxStateV2 =
  | 'QUEUED'
  | 'SENDING'
  | 'RETRY_WAIT'
  | 'ACKED'
  | 'AUTH_REQUIRED'
  | 'CONFLICT'
  | 'FAILED_PERMANENT'
  | 'SUPERSEDED'
  | 'SUPERSEDED_SERVER_INVALIDATED';

type LocalOutboxPayloadV2 =
  | { readonly transport: 'sync-event'; readonly request: AnyClientSyncEventV2 }
  | { readonly transport: 'issue-offline-practice-pack'; readonly request: IssueOfflinePracticePackRequestV2 }
  | { readonly transport: 'consume-offline-practice-pack'; readonly request: ConsumeOfflinePracticePackRequestV2 }
  | { readonly transport: 'submit-exam'; readonly request: SubmitExamCommandV2 }
  | { readonly transport: 'abandon-session'; readonly request: AbandonLearningSessionCommandV2 }
  | { readonly transport: 'offline-exam-reference'; readonly request: SubmitOfflineExamReferenceCommandV2 }
  | { readonly transport: 'discard-selection-basis'; readonly request: DiscardLearningSelectionBasisCommandV2 };

interface LocalOutboxRecordV2 {
  readonly localSequence: number;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly aggregateKey: string;
  readonly state: LocalOutboxStateV2;
  readonly requestHash: Sha256HexV1;
  readonly payload: LocalOutboxPayloadV2;
  readonly attemptCount: number;
  readonly nextAttemptAt: IsoUtcTimestamp | null;
  readonly lastErrorCode: RpcErrorCode | null;
}

interface LocalPendingAnswerIntentV2 {
  readonly eventId: UUID;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly requestHash: Sha256HexV1;
}

interface LocalSyncAckV2 {
  readonly eventId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly requestHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly sequence: number;
}

interface LocalCommandReceiptBaseV2 {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly requestHash: Sha256HexV1;
  readonly responseHash: Sha256HexV1;
  readonly receivedAt: IsoUtcTimestamp;
}

type LocalCommandReceiptV2 = LocalCommandReceiptBaseV2 & (
  | {
      readonly kind: 'offline-practice-pack.issue';
      readonly response: IssueOfflinePracticePackResponseV2;
    }
  | {
      readonly kind: 'offline-practice-pack.consume';
      readonly response: ConsumeOfflinePracticePackResponseV2;
    }
  | {
      readonly kind: 'exam.submit';
      readonly response: CommandExecutionResponseV2<SessionSubmittedCanonical>;
    }
  | {
      readonly kind: 'session.abandon';
      readonly response: CommandExecutionResponseV2<AbandonLearningSessionResponseV2>;
    }
  | {
      readonly kind: 'exam.offline-reference';
      readonly response: CommandExecutionResponseV2<OfflineExamReferenceResultV2>;
    }
  | {
      readonly kind: 'selection-basis.discard';
      readonly response: CommandExecutionResponseV2<DiscardLearningSelectionBasisResponseV2>;
    }
);

type RestoreMaterializedV2SourceIdentityV2 =
  | {
      readonly sourceKind: 'canonical-event';
      readonly sourceId: UUID;
      readonly sourceHash: Sha256HexV1;
      readonly sourceSequence: PositiveSafeIntegerV1;
    }
  | {
      readonly sourceKind: 'portable-fact';
      readonly sourceId: UUID;
      readonly sourceHash: Sha256HexV1;
      readonly sourceSequence: null;
    };

interface RestoreMaterializedLegacySyncEventSourceIdentityV2 {
  readonly sourceKind: 'legacy-sync-event';
  readonly legacySchema: 'learning-sync.v1';
  readonly originalEventId: UUID;
  readonly originalSourceSequence: PositiveSafeIntegerV1;
  readonly sourceLegacyFactHash: Sha256HexV1;
}

type LocalRemoteSourceMetadataV2 =
  | {
      readonly transport: 'sync-event';
      readonly sourceDataGeneration: DataGeneration;
      readonly eventKind: ClientSyncKind;
      readonly origin: 'client';
      readonly eventId: UUID;
      readonly sequence: PositiveSafeIntegerV1;
      readonly requestHash: Sha256HexV1;
      readonly canonicalHash: Sha256HexV1;
      readonly occurredAt: IsoUtcTimestamp;
      readonly receivedAt: IsoUtcTimestamp;
    }
  | {
      readonly transport: 'sync-event';
      readonly sourceDataGeneration: DataGeneration;
      readonly eventKind: 'session.submitted';
      readonly origin: 'server';
      readonly eventId: UUID;
      readonly sequence: PositiveSafeIntegerV1;
      readonly requestHash: null;
      readonly canonicalHash: Sha256HexV1;
      readonly occurredAt: IsoUtcTimestamp;
      readonly receivedAt: IsoUtcTimestamp;
    }
  | {
      readonly transport: 'server-change';
      readonly sourceDataGeneration: DataGeneration;
      readonly operationId: UUID;
      readonly sequence: PositiveSafeIntegerV1;
      readonly payloadHash: Sha256HexV1;
      readonly occurredAt: IsoUtcTimestamp;
      readonly receivedAt: IsoUtcTimestamp;
    }
  | {
      readonly transport: 'restore-materialization';
      readonly sourceDataGeneration: DataGeneration;
      readonly targetDataGeneration: DataGeneration;
      readonly restoreJobId: UUID;
      readonly materializationLinkId: UUID;
      readonly materializationLinkHash: Sha256HexV1;
      readonly source: RestoreMaterializedV2SourceIdentityV2;
      readonly materializedAt: IsoUtcTimestamp;
      readonly receivedAt: IsoUtcTimestamp;
    }
  | {
      readonly transport: 'restore-materialization';
      readonly sourceDataGeneration: null;
      readonly targetDataGeneration: DataGeneration;
      readonly restoreJobId: UUID;
      readonly materializationLinkId: UUID;
      readonly materializationLinkHash: Sha256HexV1;
      readonly source: RestoreMaterializedLegacySyncEventSourceIdentityV2;
      readonly materializedAt: IsoUtcTimestamp;
      readonly receivedAt: IsoUtcTimestamp;
    };

type LocalServerChangeApplyStateV2 =
  | { readonly state: 'pending'; readonly appliedAt: null; readonly quarantineId: null }
  | { readonly state: 'applied'; readonly appliedAt: IsoUtcTimestamp; readonly quarantineId: null }
  | { readonly state: 'quarantined'; readonly appliedAt: null; readonly quarantineId: UUID };

type LocalServerChangeRecordV2 = {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly sequence: number;
  readonly payloadHash: Sha256HexV1;
  readonly receivedAt: IsoUtcTimestamp;
  readonly change: LearningServerChangeV2;
  readonly applyState: LocalServerChangeApplyStateV2;
};

interface LocalQuarantineRecordV2 {
  readonly quarantineId: UUID;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly source: 'sync-pull' | 'server-change-pull' | 'bootstrap' | 'local-migration';
  readonly sourceSequence: number | null;
  readonly sourcePayloadHash: Sha256HexV1;
  readonly reasonCode:
    | 'SCHEMA_INVALID'
    | 'SEMANTIC_INVALID'
    | 'HASH_MISMATCH'
    | 'DEPENDENCY_MISSING'
    | 'GENERATION_MISMATCH';
  readonly quarantinedAt: IsoUtcTimestamp;
}

interface LocalStreamCursorV2 {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly syncSequence: number;
  readonly serverChangeSequence: number;
  readonly projectionCursors: readonly {
    readonly scope: 'published' | 'owner_preview';
    readonly previewAcceptanceId: UUID | null;
    readonly revision: number;
  }[];
  readonly catalogCursors: readonly {
    readonly certificationCode: string;
    readonly syllabusVersion: string;
    readonly channel: ContentChannel;
    readonly previewAcceptanceId: UUID | null;
    readonly previewBundleId: string | null;
    readonly previewCanonicalHash: Sha256HexV1 | null;
    readonly previewManifestHash: Sha256HexV1 | null;
    readonly previewSelectionRevision: number | null;
    readonly revision: number;
    readonly etag: string;
  }[];
}

interface DraftConflictBodyV2 {
  readonly sessionId: UUID;
  readonly sessionItemId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly scrollOffset: NonNegativeSafeIntegerV1;
  readonly revision: NonNegativeSafeIntegerV1;
  readonly deviceId: string;
  readonly receivedAt: IsoUtcTimestamp;
}

interface NoteConflictBodyV2 {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly body: string;
  readonly revision: NonNegativeSafeIntegerV1;
  readonly receivedAt: IsoUtcTimestamp;
}

interface AnswerConflictBodyV2 {
  readonly sessionId: UUID;
  readonly sessionItemId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly eventId: UUID;
  readonly receivedAt: IsoUtcTimestamp;
}

type LearningConflictBodyV2 =
  | ({ readonly kind: 'draft' } & DraftConflictBodyV2)
  | ({ readonly kind: 'note' } & NoteConflictBodyV2)
  | ({ readonly kind: 'answer' } & AnswerConflictBodyV2);

interface LocalConflictRecordBaseV2 {
  readonly conflictId: UUID;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly aggregateKey: NonEmptyTrimmedStringV1;
  readonly localVersionHash: Sha256HexV1;
  readonly remoteVersionHash: Sha256HexV1;
  readonly adoptedVersionHash: Sha256HexV1 | null;
  readonly status: 'pending' | 'resolved';
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
}

type LocalConflictRecordV2 = LocalConflictRecordBaseV2 & (
  | {
      readonly kind: 'draft';
      readonly localBody: { readonly kind: 'draft' } & DraftConflictBodyV2;
      readonly remoteBody: { readonly kind: 'draft' } & DraftConflictBodyV2;
    }
  | {
      readonly kind: 'note';
      readonly localBody: { readonly kind: 'note' } & NoteConflictBodyV2;
      readonly remoteBody: { readonly kind: 'note' } & NoteConflictBodyV2;
    }
  | {
      readonly kind: 'answer';
      readonly localBody: { readonly kind: 'answer' } & AnswerConflictBodyV2;
      readonly remoteBody: { readonly kind: 'answer' } & AnswerConflictBodyV2;
    }
);

type ResolveLearningConflictRequestV2 = {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly conflictId: UUID;
  readonly expectedLocalVersionHash: Sha256HexV1;
  readonly expectedRemoteVersionHash: Sha256HexV1;
} & (
  | { readonly resolution: 'keep-local'; readonly adoptedBody: null; readonly adoptedVersionHash: Sha256HexV1 }
  | { readonly resolution: 'accept-remote'; readonly adoptedBody: null; readonly adoptedVersionHash: Sha256HexV1 }
  | { readonly resolution: 'merge'; readonly adoptedBody: LearningConflictBodyV2; readonly adoptedVersionHash: Sha256HexV1 }
);

interface ResolveLearningConflictResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly conflictId: UUID;
  readonly status: 'resolved';
  readonly adoptedVersionHash: Sha256HexV1;
  readonly conflictAuditId: UUID;
  readonly resolvedAt: IsoUtcTimestamp;
}
```

`get_learning_conflict_v2(conflictId,dataGeneration)`と`resolve_learning_conflict_v2(request)`は`authenticated` owner本人だけへgrantし、ownerはJWTから導出して入力させません。resolveはuser/generation、`status='pending'`、DB時計で`now < expiresAt`、aggregate kind、local/remote bodyのstrict schema、両expected version hashを再検証します。各version hashは対応bodyのRFC 8785 JCS SHA-256です。keep-local/accept-remoteのadopted hashは該当version hashとexact一致、mergeは同じkindのstrict `adoptedBody`からserver再計算したhashとexact一致させ、domain aggregate更新・conflict解決・本文なしaudit・operation receiptを一transactionで確定します。`operationRequestHash=SHA-256(RFC 8785 JCS(strict request))`、`operationResponseHash`は同field自身だけを除外したstrict responseのRFC 8785 JCS SHA-256です。同operation ID・同request hashは保存responseをbyte-for-byte replayし、異内容、期限切れ、別owner、別generation、body kind/hash不一致を拒否します。response/audit/generic logへlocal/remote/adopted body、選択値、メモ本文、端末表示名を含めません。

```ts
interface LocalFeedbackCacheRecordBaseV2 {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly questionVersionId: QuestionVersionId;
  readonly feedbackRevision: number;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
}

type LocalFeedbackCacheRecordV2 =
  | (LocalFeedbackCacheRecordBaseV2 & {
      readonly namespace: 'verified';
      readonly source: { readonly type: 'attempt'; readonly attemptId: UUID };
      readonly item: AttemptFeedbackItemDto;
    })
  | (LocalFeedbackCacheRecordBaseV2 & {
      readonly namespace: 'verified';
      readonly source: { readonly type: 'exam-session'; readonly sessionId: UUID; readonly resultRevision: number; readonly ordinal: number };
      readonly item: ExamSessionFeedbackItemDto;
    })
  | (LocalFeedbackCacheRecordBaseV2 & {
      readonly namespace: 'offline-reference';
      readonly source: { readonly type: 'offline-reference'; readonly referenceResultId: UUID; readonly feedbackRevision: number; readonly ordinal: number };
      readonly item: OfflineReferenceFeedbackItemDto;
    });
```

runtime schemaは各branchで外側`source`と`item.source`のtype・ID・result/feedback revision・ordinalをexact一致させ、外側`questionVersionId`/`feedbackRevision`とitemの同名値もexact一致させます。namespaceとsourceの別branch組合せ、intersectionへ余剰source fieldを混ぜること、未回答attempt feedbackを拒否します。

```ts
interface LocalAttemptRecordBaseV2 {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly localEventId: UUID;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly localSavedAt: IsoUtcTimestamp;
}

type LocalAttemptRecordV2 =
  | (LocalAttemptRecordBaseV2 & {
      readonly state: 'pending';
      readonly canonicalAttemptId: null;
      readonly gradingStatus: 'pending';
      readonly isCorrect: null;
      readonly timingAssurance: null;
      readonly answeredAt: null;
      readonly serverReceivedAt: null;
    })
  | (LocalAttemptRecordBaseV2 & {
      readonly state: 'acknowledged';
      readonly canonicalAttemptId: UUID;
      readonly gradingStatus: 'graded';
      readonly isCorrect: boolean;
      readonly timingAssurance: 'verified';
      readonly answeredAt: IsoUtcTimestamp;
      readonly serverReceivedAt: IsoUtcTimestamp;
    })
  | (LocalAttemptRecordBaseV2 & {
      readonly state: 'acknowledged';
      readonly canonicalAttemptId: UUID;
      readonly gradingStatus: 'not_graded_suspended' | 'not_graded_acceptance_revoked';
      readonly isCorrect: null;
      readonly timingAssurance: 'verified';
      readonly answeredAt: IsoUtcTimestamp;
      readonly serverReceivedAt: IsoUtcTimestamp;
    });

type LocalRevisionedEntityV2<T> = {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly aggregateKey: string;
  readonly localRevision: number;
  readonly localSourceEventId: UUID | null;
  readonly localSequence: number | null;
  readonly remoteRevision: number | null;
  readonly localUpdatedAt: IsoUtcTimestamp;
  readonly remoteUpdatedAt: IsoUtcTimestamp | null;
  readonly remoteSource: LocalRemoteSourceMetadataV2 | null;
  readonly syncState: 'local-only' | 'queued' | 'synced' | 'conflict';
  readonly localValue: T;
  readonly remoteValue: T | null;
};

interface LocalProjectionStateV2 {
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly learningProjection: LearningProjectionSnapshotV2;
  readonly chapterReadiness: ExamReadinessSnapshotV1 | null;
}

interface LocalCatalogCacheRecordV2 {
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly channel: ContentChannel;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly revision: number;
  readonly etag: string;
  readonly questions: readonly PreAnswerQuestionDto[];
  readonly tombstones: readonly CatalogTombstoneDto[];
}

interface LocalDraftValueV2 {
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly scrollOffset: number;
  readonly deviceId: string;
}

interface LocalBookmarkValueV2 {
  readonly questionId: QuestionId;
  readonly enabled: boolean;
}

interface LocalNoteValueV2 {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly body: string;
}

interface LocalIssueValueV2 {
  readonly issueId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly category: ContentIssueCategory;
  readonly description: string;
  readonly status: ContentIssueStatusV2;
  readonly resolution: string | null;
  readonly lastIssueUpdateFactId: UUID | null;
}

type LocalStaleGenerationSourceV2 =
  | {
      readonly sourceType: 'sync-request';
      readonly sourceEventId: UUID;
      readonly sourceSequence: null;
      readonly sourceRevision: null;
      readonly receivedAt: null;
      readonly requestHash: Sha256HexV1;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: null;
    }
  | {
      readonly sourceType: 'client-sync-event';
      readonly sourceEventKind: ClientSyncKind;
      readonly sourceEventId: UUID;
      readonly sourceSequence: PositiveSafeIntegerV1;
      readonly sourceRevision: NonNegativeSafeIntegerV1 | null;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: Sha256HexV1;
      readonly canonicalHash: Sha256HexV1;
      readonly responseHash: null;
      readonly payloadHash: null;
    }
  | {
      readonly sourceType: 'server-sync-event';
      readonly sourceEventKind: 'session.submitted';
      readonly sourceEventId: UUID;
      readonly sourceSequence: PositiveSafeIntegerV1;
      readonly sourceRevision: NonNegativeSafeIntegerV1;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: null;
      readonly canonicalHash: Sha256HexV1;
      readonly responseHash: null;
      readonly payloadHash: null;
    }
  | {
      readonly sourceType: 'server-change';
      readonly sourceOperationId: UUID;
      readonly sourceSequence: PositiveSafeIntegerV1;
      readonly sourceRevision: NonNegativeSafeIntegerV1 | null;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: null;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: Sha256HexV1;
    }
  | {
      readonly sourceType: 'command-request';
      readonly sourceCommandId: UUID;
      readonly sourceSequence: null;
      readonly sourceRevision: null;
      readonly receivedAt: null;
      readonly requestHash: Sha256HexV1;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: null;
    }
  | {
      readonly sourceType: 'command-receipt';
      readonly sourceCommandId: UUID;
      readonly sourceSequence: null;
      readonly sourceRevision: NonNegativeSafeIntegerV1 | null;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: Sha256HexV1;
      readonly canonicalHash: null;
      readonly responseHash: Sha256HexV1;
      readonly payloadHash: null;
    }
  | {
      readonly sourceType: 'bootstrap-snapshot';
      readonly sourceSnapshotId: UUID;
      readonly sourceSection: BootstrapSectionV2;
      readonly sourceScopeKey: NonEmptyTrimmedStringV1;
      readonly sourceOrdinal: PositiveSafeIntegerV1;
      readonly sourceSequence: null;
      readonly sourceRevision: NonNegativeSafeIntegerV1 | null;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: null;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: Sha256HexV1;
    }
  | {
      readonly sourceType: 'catalog-projection-read';
      readonly readKind: 'catalog' | 'question-projection' | 'daily-projection';
      readonly sourceScopeKey: NonEmptyTrimmedStringV1;
      readonly sourceSequence: null;
      readonly sourceRevision: NonNegativeSafeIntegerV1;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: null;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: Sha256HexV1;
    }
  | {
      readonly sourceType: 'local-migration';
      readonly migrationVersion: NonEmptyTrimmedStringV1;
      readonly sourceSequence: null;
      readonly sourceRevision: null;
      readonly receivedAt: IsoUtcTimestamp;
      readonly requestHash: null;
      readonly canonicalHash: null;
      readonly responseHash: null;
      readonly payloadHash: Sha256HexV1;
    };

interface LocalStaleGenerationRowEnvelopeBaseV2 {
  readonly ownerUserId: UUID;
  readonly sourceDataGeneration: DataGeneration;
  readonly sourceNamespaceId: UUID;
  readonly rowKey: NonEmptyTrimmedStringV1;
  readonly source: LocalStaleGenerationSourceV2;
  readonly rowHash: Sha256HexV1;
  readonly quarantinedAt: IsoUtcTimestamp;
}

type LocalStaleGenerationRowV2 =
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'profile'; readonly row: PortableProfileFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'selection-basis'; readonly row: BootstrapSelectionBasisRowV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'content-scope'; readonly row: BootstrapContentScopeV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'session'; readonly row: LocalSessionRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'attempt'; readonly row: LocalAttemptRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'attempt-correction'; readonly row: LiveAttemptCorrectionFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'attempt-invalidation'; readonly row: LiveAttemptInvalidationFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'exam-history'; readonly row: ExamTerminalFactV2 | PortableExamResultRevisionFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'session-lifecycle'; readonly row: PortableSessionLifecycleFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'session-item-invalidation'; readonly row: PortableSessionItemInvalidationFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'outbox'; readonly row: LocalOutboxRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'pending-answer'; readonly row: LocalPendingAnswerIntentV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'acknowledgement'; readonly row: LocalSyncAckV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'command-receipt'; readonly row: LocalCommandReceiptV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'server-change'; readonly row: LocalServerChangeRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'cursor'; readonly row: LocalStreamCursorV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'conflict'; readonly row: LocalConflictRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'quarantine'; readonly row: LocalQuarantineRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'feedback-cache'; readonly row: LocalFeedbackCacheRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'catalog-cache'; readonly row: LocalCatalogCacheRecordV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'draft'; readonly row: LocalRevisionedEntityV2<LocalDraftValueV2> })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'bookmark'; readonly row: LocalRevisionedEntityV2<LocalBookmarkValueV2> })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'note'; readonly row: LocalRevisionedEntityV2<LocalNoteValueV2> })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'issue'; readonly row: LocalRevisionedEntityV2<LocalIssueValueV2> })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'issue-update'; readonly row: LiveIssueUpdateFactV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'projection'; readonly row: LocalProjectionStateV2 })
  | (LocalStaleGenerationRowEnvelopeBaseV2 & { readonly rowKind: 'offline-reference-history'; readonly row: PortableOfflineExamReferenceFactV2 | PortableOfflineReferenceResultRevisionFactV2 | PortableOfflineReferenceFeedbackRevisionFactV2 });

interface LocalStaleGenerationRootSummaryV2 {
  readonly rootKind: LocalStaleGenerationRowV2['rowKind'];
  readonly rowCount: NonNegativeSafeIntegerV1;
  readonly rootHash: Sha256HexV1;
}

interface LocalStaleGenerationNamespaceV2 {
  readonly schemaVersion: 2;
  readonly ownerUserId: UUID;
  readonly sourceDataGeneration: DataGeneration;
  readonly sourceNamespaceId: UUID;
  readonly quarantineReason: 'data-generation-changed';
  readonly sourceSnapshotId: UUID | null;
  readonly quarantinedAt: IsoUtcTimestamp;
  readonly rootSummaries: readonly LocalStaleGenerationRootSummaryV2[];
  readonly rowCount: NonNegativeSafeIntegerV1;
  readonly rowsHash: Sha256HexV1;
  readonly rows: readonly LocalStaleGenerationRowV2[];
  readonly namespaceHash: Sha256HexV1;
}

interface LocalPersistedLearningStateV2 {
  readonly schemaVersion: 2;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly namespaceId: UUID;
  readonly profile: PortableProfileFactV2;
  readonly selectionBases: readonly BootstrapSelectionBasisRowV2[];
  readonly contentScopes: readonly BootstrapContentScopeV2[];
  readonly sessions: readonly LocalSessionRecordV2[];
  readonly attempts: readonly LocalAttemptRecordV2[];
  readonly attemptCorrections: readonly LiveAttemptCorrectionFactV2[];
  readonly attemptInvalidations: readonly LiveAttemptInvalidationFactV2[];
  readonly examHistory: readonly (ExamTerminalFactV2 | PortableExamResultRevisionFactV2)[];
  readonly sessionLifecycleHistory: readonly PortableSessionLifecycleFactV2[];
  readonly sessionItemInvalidationHistory: readonly PortableSessionItemInvalidationFactV2[];
  readonly outbox: readonly LocalOutboxRecordV2[];
  readonly pendingAnswers: readonly LocalPendingAnswerIntentV2[];
  readonly acknowledgements: readonly LocalSyncAckV2[];
  readonly commandReceipts: readonly LocalCommandReceiptV2[];
  readonly serverChanges: readonly LocalServerChangeRecordV2[];
  readonly cursor: LocalStreamCursorV2;
  readonly conflicts: readonly LocalConflictRecordV2[];
  readonly quarantine: readonly LocalQuarantineRecordV2[];
  readonly staleGenerationNamespaces: readonly LocalStaleGenerationNamespaceV2[];
  readonly feedbackCache: readonly LocalFeedbackCacheRecordV2[];
  readonly catalogCache: readonly LocalCatalogCacheRecordV2[];
  readonly drafts: readonly LocalRevisionedEntityV2<LocalDraftValueV2>[];
  readonly bookmarks: readonly LocalRevisionedEntityV2<LocalBookmarkValueV2>[];
  readonly notes: readonly LocalRevisionedEntityV2<LocalNoteValueV2>[];
  readonly issues: readonly LocalRevisionedEntityV2<LocalIssueValueV2>[];
  readonly issueUpdateHistory: readonly LiveIssueUpdateFactV2[];
  readonly projections: readonly LocalProjectionStateV2[];
  readonly offlineReferenceHistory: readonly (PortableOfflineExamReferenceFactV2 | PortableOfflineReferenceResultRevisionFactV2 | PortableOfflineReferenceFeedbackRevisionFactV2)[];
}
```

全local persisted DTOは`unknown`からstrict unionで検証し、nested余剰keyを拒否します。`LocalSessionRecordV2`はlocal optimistic値と最後に検証済みのremote status/revision/indexを別fieldにし、`localUpdatedAt`とdiscriminated `remoteSource`を保持してremote未取得をnull以外で推測しません。canonical sync/server changeの適用時は対応するsource event/command、sequence、request/canonical hash、remote revision/timeをdomain rowと同じtransactionで保存します。draft/note/bookmark/issueは`localSourceEventId/localSequence`とdiscriminated `remoteSource`を保持し、最新値だけへ縮退してsource eventを失いません。bootstrapでremoteだけから生成したentityのlocal source 2 fieldは両方null、local mutationを作成したentityは両方non-nullとし、片方だけnullを拒否します。issueの管理更新はserver-change sourceを、初回報告はsync-event sourceを保存します。

`LocalProjectionStateV2`はAPI/UI正本の`LearningProjectionSnapshotV2`と`ExamReadinessSnapshotV1`をfield名・単位・nullability・全nested hashのまま保存し、`ownerUserId/dataGeneration`、scope/acceptance、readinessの`chapterProgressSnapshotHash`とprojection nested snapshot hashをexact一致させます。readiness未取得だけnullを許し、履歴からの端末再計算、別snapshot/scope/acceptanceとの結合、旧projection field名への縮退を拒否します。

server changeの`payloadHash`は`SHA-256(RFC 8785 JCS(change))`です。strict schema、hash、sequence、generation、`requiredSyncSequence`依存を全件検証後にだけ`pending -> applied`とdomain/cursorを一transactionで確定します。不正responseはraw本文をlocal domainへ保存せずsafe hash/理由だけを`LocalQuarantineRecordV2`へ記録し、response page全体のdomain/ACK/cursorを不変にします。quarantineは自動適用せずfull bootstrapまたは明示診断で解消します。

起動時に`SENDING`を`QUEUED`へ戻します。通常演習で全回答が端末保存済みでもserver canonical未確定の間はsessionを`COMPLETION_PENDING`とし、最後のACKまたはauthoritative lifecycle delta後だけ`COMPLETED`へ進めます。server invalidationに依存するoutboxは`SUPERSEDED_SERVER_INVALIDATED`、同じintentが既存canonicalへ収束した別eventは`SUPERSEDED`へ移し、削除せず監査可能にします。feedback cacheの一意keyは`(ownerUserId,dataGeneration,namespace,source,questionVersionId,feedbackRevision,contentAssurance,previewAcceptanceId,previewBundleId,previewCanonicalHash,previewManifestHash,previewSelectionRevision)`です。acceptance切替/revoke、scope/hash/result revisionの不一致は表示前にも検査し、該当cacheを同一local transactionでpurgeします。

bootstrap generationが現在local generationと同じ場合でも、server snapshotのselection-basis lifecycle、safe content、suspended/acceptance-revoked tombstoneを常にauthoritativeとし、local値で上書きしません。localから保持できるのは未ACKの`session.created` outbox/creation intent、pending answer、draft/note/bookmark/issueのlocal mutation、未解決conflictという明示allowlistだけです。これらはoutbox/intent/local-value rootにだけ保持し、server session/item/attempt/lifecycleへoverlayしません。server snapshotにterminal sessionまたは実効attemptがあればpending creation/answerをID/hash照合後にsupersedeまたはconflict化します。local basisはserver snapshotに同じbasis IDと`basisRowHash`がexact一件存在し、かつserver lifecycleが`unconsumed`の場合だけcreation intentの参照として保持できます。欠損、hash不一致、複数一致はbasisと依存intentをquarantineし、consumed/discarded basisやsuspended/acceptance-revoked contentをunconsumed/availableへ復活させません。generationが変わった場合は、旧namespaceの全rowを漏れなく非再帰の`LocalStaleGenerationRowV2`へ写し、旧owner/generation/namespace、typed row、command receiptを含む全root、source branch固有のID/sequence/revision/time/request/canonical/response/payload hashを保った一つの`LocalStaleGenerationNamespaceV2`として隔離する処理と、新generation stagingのactive namespaceへの交換を同じlocal transactionで行います。未送信sync/commandは`sync-request`/`command-request`としてrequest hashだけを保存し、sequence、receivedAt、canonical/response hashをnullへ固定します。ACK済みclient eventは`client-sync-event`としてclient kind、request/canonical hash、server sequenceを保持し、server-origin terminal `session.submitted`は`server-sync-event`としてrequest hash=null、server canonical payloadの`canonicalHash`、server sequence/revision/receivedAtを保持します。server-origin eventのcanonical正本は`sync_events.canonical_payload`、そのhash正本は同行の`canonical_hash`であり、`payloadHash`へ二重化せずnullに固定します。command完了だけが`command-receipt`となりresponse hashを持ちます。outbox、basis/lifecycle、cursor、ACK、command receipt、pending intentを新snapshotへ一件もoverlayしません。新generationの全partition検証とatomic swap commit後だけUIへ公開し、quarantine開始前、全row写し込み後、active namespace swap直前、commit直後のkill/restartで旧active namespaceへ戻るか新active namespaceと完全なstale namespaceの両方が見えるかの二状態だけを許可します。server terminalを含め旧write再送0、暗黙ACK 0、current overlay 0を固定fixtureで検証します。stale namespaceは通常sync・採点・restore入力に使用せず、明示監査exportまたはnamespace単位のatomic discardだけを許可し、row単位削除や暗黙GCを禁止します。全rowのowner/source generation/source namespace/quarantinedAtはnamespace headerとexact一致させます。`sourceType`ごとに上記unionの必須IDとhashだけを許可し、別branchのfield、偽のevent/command ID、暗黙defaultを拒否します。owner/generation/namespace/time不一致、同じ`(rowKind,rowKey)`重複、source branch不整合、row hash不一致をstrict schemaで拒否します。

`rows`は`(rowKind registry ordinal,rowKey UTF-8 bytes)`順、`rootSummaries`は同じregistry順かつroot kind重複なしです。各`rootHash=SHA-256(JCS(当該rootのrows))`、`rowsHash=SHA-256(JCS(rows))`、`rowCount=rows.length`で、summary count/hashの総和と全rowがexact一致しなければなりません。`namespaceHash=SHA-256(JCS(namespaceHashだけを除くstrict LocalStaleGenerationNamespaceV2))`です。bootstrap起因だけ`sourceSnapshotId`を元snapshot ID、restore/delete等によるgeneration交換はnullとし、`quarantineReason`、snapshot ID、root summary、rowsまたはheaderの一bit変更を検知します。

```ts
interface PortableExportManifestV2 {
  readonly exportId: UUID;
  readonly schemaVersion: 2;
  readonly ownerUserId: UUID;
  readonly issuedAt: IsoUtcTimestamp;
  readonly sourceSyncUpperBound: number;
  readonly sourceServerChangeUpperBound: number;
  readonly sourceProjectionCursors: readonly {
    readonly scope: 'published' | 'owner_preview';
    readonly previewAcceptanceId: UUID | null;
    readonly revision: number;
  }[];
  readonly sourceDataGeneration: DataGeneration;
  readonly actorPseudonymSalt: Base64Url32BytesV1;
  readonly payloadHash: Sha256HexV1;
  readonly signingKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface SessionFactV2 {
  readonly sessionId: UUID;
  readonly createdEventId: UUID;
  readonly mode: LearningMode;
  readonly title: string;
  readonly status: SessionStatus;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly examPolicy: ExamPolicy | null;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly selectionBasisId: UUID | null;
  readonly selectionSpec: NormalSelectionSpecV2 | null;
  readonly catalogRevision: number;
  readonly examBlueprintVersion: string | null;
  readonly examBlueprintHash: Sha256HexV1 | null;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly actualQuestionCount: number;
  readonly answerableQuestionCount: number;
  readonly revision: number;
  readonly currentIndex: number;
  readonly startedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp | null;
  readonly submittedAt: IsoUtcTimestamp | null;
  readonly completedAt: IsoUtcTimestamp | null;
}

interface SessionItemFactV2 {
  readonly sessionItemId: UUID;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: number;
  readonly choiceOrder: readonly ChoiceId[];
  readonly reviewMarked: boolean;
  readonly status: 'active' | 'invalidated';
  readonly invalidatedReason: 'question_suspended' | 'acceptance_revoked' | null;
}

interface PortableSessionItemInvalidationFactV2 {
  readonly sessionItemInvalidationFactId: UUID;
  readonly sessionItemId: UUID;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: NonNegativeSafeIntegerV1;
  readonly reasonCode: 'question_suspended';
  readonly operationId: UUID;
  readonly sourceTargetMemberId: UUID;
  readonly priorSessionRevision: NonNegativeSafeIntegerV1;
  readonly resultingSessionRevision: PositiveSafeIntegerV1;
  readonly answerableQuestionCount: NonNegativeSafeIntegerV1;
  readonly resultingSessionStatus: SessionStatus;
  readonly invalidatedAt: IsoUtcTimestamp;
  readonly factHash: Sha256HexV1;
}

interface RestoreSessionItemInvalidationMaterializationLinkV2 {
  readonly restoreMaterializationLinkId: UUID;
  readonly restoreJobId: UUID;
  readonly sourceDataGeneration: DataGeneration;
  readonly targetDataGeneration: DataGeneration;
  readonly sessionItemInvalidationFactId: UUID;
  readonly sessionItemInvalidationFactHash: Sha256HexV1;
  readonly targetSessionItemId: UUID;
  readonly materializedAt: IsoUtcTimestamp;
  readonly linkHash: Sha256HexV1;
}

interface DraftFactV2 {
  readonly sourceEventId: UUID;
  readonly sourceSequence: number;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly scrollOffset: number;
  readonly deviceId: string;
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
}

interface AttemptFactV2 {
  readonly attemptId: UUID;
  readonly sourceEventId: UUID;
  readonly sessionId: UUID;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly gradingStatus:
    | 'graded'
    | 'not_graded_suspended'
    | 'not_graded_acceptance_revoked';
  readonly originalOutcome: boolean | null;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly timingAssurance: 'verified';
  readonly responseMs: number | null;
  readonly answeredAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
  readonly timezoneAtReceipt: string;
  readonly localDate: string;
}

interface LiveAttemptCorrectionFactV2 {
  readonly correctionId: UUID;
  readonly attemptId: UUID;
  readonly correctionNo: number;
  readonly priorCorrectionId: UUID | null;
  readonly oldOutcome: boolean;
  readonly correctedOutcome: boolean;
  readonly reason: AttemptCorrectionReasonCodeV2;
  readonly operationId: UUID;
  readonly correctedAt: IsoUtcTimestamp;
}

interface LiveAttemptInvalidationFactV2 {
  readonly invalidationId: UUID;
  readonly attemptId: UUID;
  readonly reason: AttemptInvalidationReasonCodeV2;
  readonly operationId: UUID;
  readonly invalidatedAt: IsoUtcTimestamp;
}

interface PortableActorMapEntryV2 {
  readonly actorExportPseudonym: Base64Url32BytesV1;
  readonly actorRole: PortableActorRoleV2;
  readonly sourcePrincipalSnapshotDigest: Sha256HexV1;
}

interface PortableAttemptCorrectionFactV2 extends LiveAttemptCorrectionFactV2 {
  readonly actorExportPseudonym: Base64Url32BytesV1;
  readonly actorRole: PortableActorRoleV2;
}

interface PortableAttemptInvalidationFactV2 extends LiveAttemptInvalidationFactV2 {
  readonly actorExportPseudonym: Base64Url32BytesV1;
  readonly actorRole: PortableActorRoleV2;
}

interface ExamTerminalFactV2 {
  readonly terminalEventId: UUID;
  readonly sessionId: UUID;
  readonly finalizerVersion: 'verified-v2';
  readonly examPolicy: ExamPolicy;
  readonly examBlueprintVersion: string;
  readonly examBlueprintHash: Sha256HexV1;
  readonly submittedAt: IsoUtcTimestamp;
  readonly score: number;
  readonly denominator: number;
  readonly passingScore: 26 | null;
  readonly passed: boolean | null;
  readonly resultStatus: 'valid' | 'invalidated';
  readonly resultRevision: number;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly timingAssurance: 'verified';
  readonly items: readonly ExamAttemptSummaryDto[];
}

interface BookmarkFactV2 {
  readonly sourceEventId: UUID;
  readonly sourceSequence: number;
  readonly questionId: QuestionId;
  readonly enabled: boolean;
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
}

interface NoteFactV2 {
  readonly sourceEventId: UUID;
  readonly sourceSequence: number;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly body: string;
  readonly revision: number;
  readonly updatedAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
}

interface IssueFactV2 {
  readonly issueId: UUID;
  readonly sourceEventId: UUID;
  readonly sourceSequence: number;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly category: ContentIssueCategory;
  readonly description: string;
  readonly reportedAt: IsoUtcTimestamp;
  readonly revision: 1;
  readonly status: 'open';
  readonly resolution: null;
  readonly updatedAt: IsoUtcTimestamp;
}

type ContentIssueTransitionV2 =
  | {
      readonly oldStatus: 'open';
      readonly newStatus: 'investigating';
      readonly oldResolution: null;
      readonly newResolution: null;
    }
  | {
      readonly oldStatus: 'open' | 'investigating';
      readonly newStatus: 'resolved' | 'rejected';
      readonly oldResolution: null;
      readonly newResolution: NonEmptyTrimmedStringV1;
    };

interface LiveIssueUpdateFactBaseV2 {
  readonly issueUpdateFactId: UUID;
  readonly issueId: UUID;
  readonly revision: number;
  readonly priorUpdateFactId: UUID | null;
  readonly reason: NonEmptyTrimmedStringV1;
  readonly operationId: UUID;
  readonly updatedAt: IsoUtcTimestamp;
}

type LiveIssueUpdateFactV2 = LiveIssueUpdateFactBaseV2 & ContentIssueTransitionV2;

type PortableIssueUpdateFactV2 = LiveIssueUpdateFactV2 & {
  readonly actorExportPseudonym: Base64Url32BytesV1;
  readonly actorRole: PortableActorRoleV2;
};

interface PortableEventIdentityFactBaseV2 {
  readonly sourceSequence: number;
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly eventId: UUID;
  readonly entityId: string;
  readonly occurredAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
  readonly canonicalHash: Sha256HexV1;
}

type PortableEventIdentityFactV2 = PortableEventIdentityFactBaseV2 & (
  | {
      readonly kind: ClientSyncKind;
      readonly origin: 'client';
      readonly requestHash: Sha256HexV1;
    }
  | {
      readonly kind: 'session.submitted';
      readonly origin: 'server';
      readonly requestHash: null;
    }
);

type PortableCanonicalEventFactV2 = {
  [K in LearningSyncKind]: {
    readonly identity: PortableEventIdentityFactV2 & { readonly kind: K };
    readonly canonicalPayload: SyncCanonicalPayloadMap[K];
  };
}[LearningSyncKind];

type LegacyLearningSyncKind = LegacyCanonicalSyncEventV1['kind'];

interface PortableLegacyEventIdentityFactV1<K extends LegacyLearningSyncKind> {
  readonly sourceSequence: number;
  readonly contractVersion: null;
  readonly legacySchema: 'learning-sync.v1';
  readonly readOnly: true;
  readonly dataGeneration: null;
  readonly eventId: UUID;
  readonly kind: K;
  readonly entityId: string;
  readonly occurredAt: IsoUtcTimestamp;
  readonly receivedAt: IsoUtcTimestamp;
  readonly requestHash: null;
  readonly canonicalHash: null;
}

type PortableLegacyCanonicalEventFactV1 = {
  [K in LegacyLearningSyncKind]: {
    readonly identity: PortableLegacyEventIdentityFactV1<K>;
    readonly canonicalPayload: Extract<LegacyCanonicalSyncEventV1, { readonly kind: K }>['payload'];
  };
}[LegacyLearningSyncKind];

type PortableCanonicalEventFact =
  | PortableLegacyCanonicalEventFactV1
  | PortableCanonicalEventFactV2;

interface PortableProfileFactV2 {
  readonly revision: number;
  readonly timezone: string;
  readonly settings: PortableProfileSettingsV2;
}

interface PortableProfileSettingsV2 {
  readonly colorScheme: 'system' | 'light' | 'dark';
  readonly textScale: 100 | 125 | 150 | 175 | 200;
  readonly reducedMotion: boolean;
  readonly defaultQuestionCount: 10 | 20 | 30 | 40;
}

interface PortableSelectionBasisItemFactV2 {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly ordinal: number;
  readonly choiceOrder: readonly ChoiceId[];
}

interface PortableSelectionBasisFactV2 extends Omit<LearningSelectionBasisV2, 'selectedItems'> {
  readonly ownerUserId: UUID;
  readonly consumedEventId: UUID;
  readonly selectedItems: readonly PortableSelectionBasisItemFactV2[];
}

interface PortableContentAcceptanceFactV2 {
  readonly acceptanceId: UUID;
  readonly ownerUserId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly rawHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly manifestHash: Sha256HexV1;
  readonly acceptedQuestionVersionIds: readonly QuestionVersionId[];
  readonly acceptedAt: IsoUtcTimestamp;
}

interface PortablePreviewSelectionEventFactV2 {
  readonly selectionEventId: UUID;
  readonly ownerUserId: UUID;
  readonly acceptanceId: UUID;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly selectionRevision: number;
  readonly selectedAt: IsoUtcTimestamp;
}

interface PortableContentAcceptanceRevocationFactV2 {
  readonly revocationId: UUID;
  readonly acceptanceId: UUID;
  readonly reasonCode: 'owner_revoked' | 'acceptance_replaced' | 'operation_revoked';
  readonly operationId: UUID;
  readonly revokedByExportPseudonym: Base64Url32BytesV1;
  readonly revokedByRole: PortableActorRoleV2;
  readonly revokedAt: IsoUtcTimestamp;
}

interface PortableExamResultRevisionFactV2 {
  readonly revisionId: UUID;
  readonly sessionId: UUID;
  readonly resultRevision: number;
  readonly priorResultRevision: number;
  readonly score: number;
  readonly denominator: number;
  readonly passingScore: 26 | null;
  readonly passed: boolean | null;
  readonly resultStatus: 'valid' | 'invalidated';
  readonly reasonCode: 'question_suspended' | 'answer_corrected' | 'attempt_invalidated';
  readonly operationId: UUID;
  readonly revisedAt: IsoUtcTimestamp;
  readonly items: readonly ExamAttemptSummaryDto[];
}

interface PortableSessionLifecycleFactBaseV2 {
  readonly lifecycleFactId: UUID;
  readonly sessionId: UUID;
  readonly revision: number;
  readonly operationId: UUID;
  readonly terminalAt: IsoUtcTimestamp;
}

type PortableSessionLifecycleFactV2 =
  | (PortableSessionLifecycleFactBaseV2 & {
      readonly status: 'completed';
      readonly reasonCode: 'all_answerable_items_completed';
    })
  | (PortableSessionLifecycleFactBaseV2 & {
      readonly status: 'abandoned';
      readonly reasonCode: 'user_abandoned';
    })
  | (PortableSessionLifecycleFactBaseV2 & {
      readonly status: 'invalidated';
      readonly reasonCode: 'question_suspended' | 'acceptance_revoked' | 'operation_invalidated';
    });

interface PortableOfflineExamReferenceItemFactV2 extends OfflineExamReferenceItemResultV2 {
  readonly ordinal: number;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly localSavedAt: IsoUtcTimestamp | null;
}

interface PortableOfflineExamReferenceFactV2 {
  readonly referenceResultId: UUID;
  readonly commandId: UUID;
  readonly sessionId: UUID;
  readonly bundleId: UUID;
  readonly bundleHash: Sha256HexV1;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly score: number;
  readonly denominator: number;
  readonly resultRevision: NonNegativeSafeIntegerV1;
  readonly feedbackRevision: number;
  readonly createdAt: IsoUtcTimestamp;
  readonly items: readonly PortableOfflineExamReferenceItemFactV2[];
}

interface PortableOfflineReferenceResultRevisionFactV2 {
  readonly resultRevisionId: UUID;
  readonly referenceResultId: UUID;
  readonly resultRevision: PositiveSafeIntegerV1;
  readonly priorResultRevision: NonNegativeSafeIntegerV1;
  readonly priorScore: NonNegativeSafeIntegerV1;
  readonly score: NonNegativeSafeIntegerV1;
  readonly priorDenominator: NonNegativeSafeIntegerV1;
  readonly denominator: NonNegativeSafeIntegerV1;
  readonly reasonCode: 'question_suspended' | 'acceptance_revoked';
  readonly operationId: UUID;
  readonly revisedAt: IsoUtcTimestamp;
  readonly affectedOrdinals: NonEmptyReadonlyArray<NonNegativeSafeIntegerV1>;
  readonly items: readonly OfflineExamReferenceItemResultV2[];
}

interface PortableOfflineReferenceFeedbackRevisionFactV2 {
  readonly feedbackRevisionId: UUID;
  readonly resultRevisionId: UUID;
  readonly referenceResultId: UUID;
  readonly feedbackRevision: number;
  readonly priorFeedbackRevision: number;
  readonly reasonCode: 'question_suspended' | 'acceptance_revoked';
  readonly operationId: UUID;
  readonly revisedAt: IsoUtcTimestamp;
  readonly originalItemCount: PositiveSafeIntegerV1;
  readonly tombstonedOrdinals: NonEmptyReadonlyArray<NonNegativeSafeIntegerV1>;
  readonly affectedItems: NonEmptyReadonlyArray<{
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly ordinal: number;
  }>;
}

type PortableCommandReceiptV2 =
  | {
      readonly kind: 'exam.submit';
      readonly commandId: UUID;
      readonly ownerUserId: UUID;
      readonly dataGeneration: DataGeneration;
  readonly requestHash: Sha256HexV1;
      readonly responseHash: Sha256HexV1;
      readonly response: SessionSubmittedCanonical;
      readonly createdAt: IsoUtcTimestamp;
    }
  | {
      readonly kind: 'session.abandon';
      readonly commandId: UUID;
      readonly ownerUserId: UUID;
      readonly dataGeneration: DataGeneration;
      readonly requestHash: Sha256HexV1;
      readonly responseHash: Sha256HexV1;
      readonly response: AbandonLearningSessionResponseV2;
      readonly createdAt: IsoUtcTimestamp;
    }
  | {
      readonly kind: 'exam.offline-reference';
      readonly commandId: UUID;
      readonly ownerUserId: UUID;
      readonly dataGeneration: DataGeneration;
      readonly requestHash: Sha256HexV1;
      readonly responseHash: Sha256HexV1;
      readonly response: OfflineExamReferenceResultV2;
      readonly createdAt: IsoUtcTimestamp;
    };

interface ServerPortableExportPayloadV2 {
  readonly profile: PortableProfileFactV2;
  readonly actorMap: readonly PortableActorMapEntryV2[];
  readonly canonicalEvents: readonly PortableCanonicalEventFact[];
  readonly commandReceipts: readonly PortableCommandReceiptV2[];
  readonly selectionBases: readonly PortableSelectionBasisFactV2[];
  readonly personalContentAcceptances: readonly PortableContentAcceptanceFactV2[];
  readonly acceptanceRevocations: readonly PortableContentAcceptanceRevocationFactV2[];
  readonly previewSelectionEvents: readonly PortablePreviewSelectionEventFactV2[];
  readonly sessions: readonly SessionFactV2[];
  readonly sessionItems: readonly SessionItemFactV2[];
  readonly sessionItemInvalidations: readonly PortableSessionItemInvalidationFactV2[];
  readonly drafts: readonly DraftFactV2[];
  readonly attempts: readonly AttemptFactV2[];
  readonly attemptCorrections: readonly PortableAttemptCorrectionFactV2[];
  readonly attemptInvalidations: readonly PortableAttemptInvalidationFactV2[];
  readonly examTerminals: readonly ExamTerminalFactV2[];
  readonly examResultRevisions: readonly PortableExamResultRevisionFactV2[];
  readonly sessionLifecycleFacts: readonly PortableSessionLifecycleFactV2[];
  readonly offlineExamReferences: readonly PortableOfflineExamReferenceFactV2[];
  readonly offlineReferenceResultRevisions: readonly PortableOfflineReferenceResultRevisionFactV2[];
  readonly offlineReferenceFeedbackRevisions: readonly PortableOfflineReferenceFeedbackRevisionFactV2[];
  readonly bookmarks: readonly BookmarkFactV2[];
  readonly notes: readonly NoteFactV2[];
  readonly issues: readonly IssueFactV2[];
  readonly issueUpdates: readonly PortableIssueUpdateFactV2[];
}

interface ServerPortableExportV2 {
  readonly manifest: PortableExportManifestV2;
  readonly payload: ServerPortableExportPayloadV2;
}
```

selection basis discard command、`SelectionBasisDiscardedFactV2`、そのcommand receiptはserver/localのcontrol auditだけです。`ServerPortableExportPayloadV2.selectionBases`はconsume済み`PortableSelectionBasisFactV2`だけ、`commandReceipts`は`exam.submit`、`session.abandon`、`exam.offline-reference`の三branchだけを許可し、discard fact/receiptをportable payload、`restored_command_replay_archive_v2`、restore materialization linkへ含めません。restore後にdiscard responseをsource archiveからreplayせず、current generationで必要なら新command IDの明示操作として実行します。portable validatorはdiscard kind、discard fact ID、discardedAtが一件でも含まれれば`UNSUPPORTED_SOURCE_SCHEMA`で全体を拒否します。

`LocalSessionRecordV2`と`LocalPersistedLearningStateV2`は端末強制終了復旧専用で、control-plane restore入力に使用しません。旧端末snapshotはallowlist projectionでv2へ移行した同一transaction内で旧blobを破棄します。全階層の未知key、正答・解説field、owner/generation不一致を拒否します。restore後local rowの`restore-materialization` sourceはv2 source branchとlegacy sync-event branchをstrictに分離し、legacy branchだけ`sourceDataGeneration=null`を許可します。

portable exportはserverだけが生成し、`payloadHash = SHA-256(RFC 8785 JCS(payload))`とします。Ed25519署名対象はmanifestから`signature`だけを除いたRFC 8785 JCS bytesで、`payloadHash`、owner、data generation、stream/projection上限、key ID/algorithmを全て拘束します。canonical event factはv2のsource sequence、全envelope field、request/canonical hash、型別canonical payloadと、初期schemaに実在したv1 read-only payloadを別unionで保持します。v1に存在しなかったhash/generationを生成せず、v2 ACK・outbox・mutationへ変換しません。command receiptはrequest/response hashとstrict保存済みresponseを保持し、過去responseを現在のdomain stateから推測しません。全schemaは全階層の未知keyをrejectします。問題本文、正答、解説、feedback本文、outbox、cursor、ACK、tokenを含めず、session/version IDからowned-session RPCで現在のsafe contentを再hydrateします。suspended/revoked版は必ずtombstoneへ置換します。

`PortableActorRoleV2`をportable actor roleの唯一のregistryとし、sourceの`admin`は`content-admin`へ正規化し、未知roleを拒否します。訂正・無効化・acceptance revoke・issue updateの`actorExportPseudonym`は`base64url(SHA-256(UTF8('portable-actor-v2') || 0x00 || UUID_BYTES(exportId) || BASE64URL_DECODE(actorPseudonymSalt) || HEX_DECODE(sourcePrincipalSnapshotDigest)))`です。`actorPseudonymSalt`はexportごとの公開32 random bytesをbase64url no-paddingでmanifest署名へ拘束します。`actorRole`はsource auditの固定role registryから写し、restore worker自身をactorへ置換しません。`actorMap`はexport内で参照されるpseudonymをexact一件ずつ持ち、`sourcePrincipalSnapshotDigest=SHA-256(UTF8('portable-principal-snapshot-v2') || 0x00 || RFC8785_JCS(principalSnapshot))`を結合します。export時はsource principal、role、全portable correction/invalidation/acceptance revocation/issue update参照を再検証し、restore時はmanifest署名、pseudonym再計算、mappingの一意性、全参照のexact coverage、unused map 0を検証します。targetにはPIIを持たないpseudonymous principal snapshotを作り、`restore_actor_materialization_links(restoreJobId,actorExportPseudonym,targetPrincipalSnapshotId)`で一意に結合します。source auditにprincipal snapshotまたは許可roleが欠ける、同一pseudonymへrole不一致がある場合はexport/restoreをfail-closedにします。

P0 restoreは`empty-learning-namespace-only`です。merge、既存学習データの置換、cross-account importを実装しません。dry-run時とexclusive user lock取得後の両方で、sync/replay archive、server change、command receipt、consume済みbasis、未consumeかつ未discard basis、acceptance/revoke/selection、session/item/draft/attempt/correction/invalidation、exam terminal/revision、offline reference/revision、bookmark、note、issue/update、projection、非既定profile settingsが一件でもあれば`RESTORE_TARGET_NOT_EMPTY`で拒否します。discard済み未consume basisとappend-only discard fact、auth user、現在device、当該restore job/upload、operation audit、初期generation行だけを空判定から除外します。dry-run reportは拒否原因となったactive basis IDを列挙し、暗黙discardしません。restore stagingは署名、payload hash、owner、fact間FK、event/command IDの内部重複を検証してから単一finalize transactionへ進みます。source event/envelopeとcommand receiptはsource generationのまま`restored_event_replay_archive_v2`/`restored_command_replay_archive_v2`へ保存し、session/item/attempt/projection等のcurrent domain rowだけを新しいtarget generationへmaterializeします。`restore_materialization_links`がrestore job、source kind/ID/generation、target generation/IDを一意に結合します。fact取込、archive、link、profile設定、derived projection再構築、generation increment、job適用を一つのfinalize transactionで確定し、失敗時はlive namespace/generationを不変にします。source eventをcurrent generation streamへ再採番して混ぜず、current stream/cursorはfull bootstrap後の新規writeから開始します。read-only replayはsource archiveから元responseを返し、current streamへ再発行しません。archiveへ全値一致する既確定requestだけ保存済みresponseを返し、同ID異内容を拒否します。

全user mutation経路（legacy bridge、sync ingest、session/exam start、draft/answer、abandon、exam finalizer、訂正・無効化、preview selection）は§10の同じuser key shared lockから始まる唯一の順序を使います。restore finalizeだけが同keyのexclusive lockを取り、portable payloadのquestion version全件をUUID bytes昇順にshared lockした後でsignature/hash/owner/generation/全fact conflict/現在statusを再検証します。suspended/revoked contentをavailableとして復元せずtombstone/invalidationへ決定的に変換し、変換fact/linkも同じfinalize transactionへ含めます。lock競合中の通常writeは`RESTORE_IN_PROGRESS`として安全に再試行し、restore成功時に`dataGeneration`をincrementします。portable receiptと完全一致する既確定requestのread-only replayを除き、旧generationの端末outbox・command・selection basis・cursorは`STALE_DATA_GENERATION`で隔離し、自動rebaseしません。legacy write bridgeのcutover完了をrestore feature有効化の前提にします。

上記shared lock対象にはselection basis、profile設定、personal acceptance作成/activate/revoke、問題報告、管理issue更新も含みます。管理issue更新は対象user lockを先に取得し、restore finalizeとaccount deletionは同じexclusive user lockで相互排他にします。各learner mutationは入力generationを検証し、responseにもgenerationを返します。

export payloadと3上限は一つのrepeatable-read DB snapshotから読み、署名前にfact count/FK/hashを再検証します。export job実行中の後続writeは次回export対象となり、同一payloadへ混在させません。

署名private keyはisolated workerのsecret storeだけに置き、DBにはkey ID/public key/status/validity windowだけを保存します。rotation後のretired public keyは既存export検証用に保持し、compromised/revoked keyのexportはrestoreを拒否して監査へ記録します。

portable selection basisはconsume済みだけを監査provenanceとして出力し、selected itemから`content`を物理的に除外します。未consume basisはephemeralでexport対象外です。private preview prompt/body/choices canaryがexport bytesとrestore stagingに0件であることをstrict schema試験します。

## 7. Feedback RPC

```sql
public.get_learning_feedback_v2(
  p_data_generation bigint,
  p_session_id uuid,
  p_question_id text default null
)
returns jsonb
```

```ts
interface FeedbackChoiceDto {
  readonly id: ChoiceId;
  readonly label: string;
  readonly body: string;
  readonly explanation: string;
  readonly isCorrect: boolean;
}

type FeedbackSourceDto =
  | { readonly type: 'attempt'; readonly attemptId: UUID }
  | { readonly type: 'exam-session'; readonly sessionId: UUID; readonly resultRevision: number; readonly ordinal: number }
  | { readonly type: 'offline-reference'; readonly referenceResultId: UUID; readonly feedbackRevision: number; readonly ordinal: number };

interface AnsweredRevealedFeedbackItemDto {
  readonly source: FeedbackSourceDto;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly sourceReference: string;
  readonly feedbackRevision: number;
  readonly ordinal: number;
  readonly answered: true;
  readonly excluded: false;
  readonly excludedReason: null;
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly isCorrect: boolean;
  readonly score: 0 | 1;
  readonly visibility: 'revealed';
  readonly questionExplanation: string;
  readonly takeaway: string;
  readonly commonTrap: string;
  readonly correctChoiceIds: readonly ChoiceId[];
  readonly choices: readonly FeedbackChoiceDto[];
}

interface UnansweredRevealedFeedbackItemDto {
  readonly source: Exclude<FeedbackSourceDto, { readonly type: 'attempt' }>;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly sourceReference: string;
  readonly feedbackRevision: number;
  readonly ordinal: number;
  readonly answered: false;
  readonly excluded: false;
  readonly excludedReason: null;
  readonly selectedChoiceIds: readonly [];
  readonly isCorrect: null;
  readonly score: 0;
  readonly visibility: 'revealed';
  readonly questionExplanation: string;
  readonly takeaway: string;
  readonly commonTrap: string;
  readonly correctChoiceIds: readonly ChoiceId[];
  readonly choices: readonly FeedbackChoiceDto[];
}

interface UnavailableFeedbackTombstoneDto {
  readonly source: FeedbackSourceDto;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly feedbackRevision: number;
  readonly ordinal: number;
  readonly answered: boolean;
  readonly excluded: true;
  readonly excludedReason: 'suspended' | 'acceptance_revoked';
  readonly selectedChoiceIds: readonly ChoiceId[];
  readonly isCorrect: null;
  readonly score: null;
  readonly visibility: 'unavailable-tombstone';
  readonly questionExplanation: null;
  readonly takeaway: null;
  readonly commonTrap: null;
  readonly correctChoiceIds: readonly [];
  readonly choices: readonly [];
}

type FeedbackItemDto =
  | AnsweredRevealedFeedbackItemDto
  | UnansweredRevealedFeedbackItemDto
  | UnavailableFeedbackTombstoneDto;

type AttemptFeedbackItemDto = FeedbackItemDto & {
  readonly source: { readonly type: 'attempt'; readonly attemptId: UUID };
};

type ExamSessionFeedbackItemDto = FeedbackItemDto & {
  readonly source: { readonly type: 'exam-session'; readonly sessionId: UUID; readonly resultRevision: number; readonly ordinal: number };
};

type OfflineReferenceFeedbackItemDto = FeedbackItemDto & {
  readonly source: { readonly type: 'offline-reference'; readonly referenceResultId: UUID; readonly feedbackRevision: number; readonly ordinal: number };
};

type LearningFeedbackResponseV2 =
  | {
      readonly contractVersion: 2;
      readonly dataGeneration: DataGeneration;
      readonly mode: 'normal';
      readonly sessionId: UUID;
      readonly contentChannel: ContentChannel;
      readonly contentAssurance: ContentAssurance;
      readonly previewAcceptanceId: UUID | null;
      readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
      readonly previewSelectionRevision: number | null;
      readonly resultRevision: null;
      readonly items: readonly [AttemptFeedbackItemDto];
    }
  | {
      readonly contractVersion: 2;
      readonly dataGeneration: DataGeneration;
      readonly mode: 'exam';
      readonly sessionId: UUID;
      readonly contentChannel: ContentChannel;
      readonly contentAssurance: ContentAssurance;
      readonly previewAcceptanceId: UUID | null;
      readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
      readonly previewSelectionRevision: number | null;
      readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
      readonly resultRevision: number;
      readonly items: readonly ExamSessionFeedbackItemDto[];
    };
```

通常演習:

- question ID必須。
- owner session、pin版とattempt factの存在を要求する。実効graded attemptだけrevealed、server確認済みsuspended/revoked無採点attemptだけtombstoneを返す。
- 一件だけ返す。
- suspendedまたはacceptance revokedは正答なし`unavailable-tombstone`を返す。
- client cache keyは下記source unionとquestion version、feedback revisionで、suspend tombstone適用時に同versionをpurgeする。
- owner preview sessionの確定attemptだけreviewing版feedbackを許可し、published正式分析へ混入させない。

模試:

- question IDはnull。
- completedかつsubmitted済みを要求する。
- 全40 itemをordinal順で返す。
- 未回答は`answered=false`、`isCorrect=null`、score 0。
- suspendedは説明、正答、choicesを空にする。

catalog/feedbackの本人状態依存readもuser shared advisory lockを取得し、入力generationを現在値と照合します。response generationがlocal currentと一致しない場合、clientはcacheへ一件も適用しません。回答済み、未回答、suspended、acceptance revoked、複数模試の未回答、result revision更新後purgeをstrict schema/E2Eで検証します。

offline referenceの確定後にpin版がsuspendまたはacceptance revokeされた場合、元のreference result/itemを更新しません。同じfanout transactionで`PortableOfflineReferenceResultRevisionFactV2`と`PortableOfflineReferenceFeedbackRevisionFactV2`、`offline-reference.feedback-revised` changeをappendし、result/feedback revisionをそれぞれexact 1増加させます。result revisionは直前実効itemsのうち影響ordinalだけを`excluded=true/isCorrect=null/score=null`へ置換し、非影響ordinalをbyte-for-byte保持した全ordinal配列からscoreとdenominatorを再計算します。feedback revisionの`tombstonedOrdinals`と`affectedItems`は実際にsuspend/revokeされた同じnon-empty subsetだけで、全ordinal集合へ拡張しません。専用feedback RPCは元resultのordinal集合を欠落・追加・並替えず全件返し、影響ordinalだけを同じsource ID・新feedback revision・ordinalを持つ`UnavailableFeedbackTombstoneDto`へ置換し、非影響ordinalはanswered/unanswered strict branchと正答feedbackを保持します。`items.length=originalItemCount`、ordinal 0始まり、欠番・重複0、result/feedback revision factとchangeのID・revision・affected集合exact一致を要求します。clientはchange受信時に旧reference cacheと旧実効resultを同一local transactionで置換し、混在revisionを表示しません。

### 7.1 Offline通常演習pack

```ts
interface OfflinePracticePackItemV2 {
  readonly ordinal: NonNegativeSafeIntegerV1;
  readonly question: PreAnswerQuestionDto;
  readonly choiceOrder: readonly ChoiceId[];
}

interface OfflinePracticePackV2 {
  readonly contractVersion: 2;
  readonly packId: UUID;
  readonly reservedSessionId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly certificationCode: NonEmptyTrimmedStringV1;
  readonly syllabusVersion: NonEmptyTrimmedStringV1;
  readonly contentChannel: 'personal_preview';
  readonly contentAssurance: 'owner_preview';
  readonly acceptanceId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly canonicalHash: Sha256HexV1;
  readonly manifestHash: Sha256HexV1;
  readonly selectionRevision: PositiveSafeIntegerV1;
  readonly chapterNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly selectionSpec: NormalSelectionSpecV2;
  readonly catalogRevision: NonNegativeSafeIntegerV1;
  readonly selectionBasisId: UUID;
  readonly selectionBasisHash: Sha256HexV1;
  readonly items: NonEmptyReadonlyArray<OfflinePracticePackItemV2>;
  readonly issuedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly signerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface IssueOfflinePracticePackRequestV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly reservedSessionId: UUID;
  readonly certificationCode: NonEmptyTrimmedStringV1;
  readonly syllabusVersion: NonEmptyTrimmedStringV1;
  readonly acceptanceId: UUID;
  readonly expectedSelectionRevision: PositiveSafeIntegerV1;
  readonly chapterNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly requestedQuestionCount: 10 | 20 | 30 | 40;
  readonly selectionSpec: NormalSelectionSpecV2;
}

interface IssueOfflinePracticePackResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly receiptId: UUID;
  readonly pack: OfflinePracticePackV2;
  readonly packHash: Sha256HexV1;
  readonly packStatus: 'issued';
  readonly packRevision: 1;
  readonly selectionBasisStatus: 'unconsumed';
}

interface ConsumeOfflinePracticePackRequestV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly packId: UUID;
  readonly packHash: Sha256HexV1;
  readonly selectionBasisId: UUID;
  readonly selectionBasisHash: Sha256HexV1;
  readonly expectedPackRevision: 1;
  readonly sessionCreatedEvent: SyncEventEnvelopeV2<'session.created'>;
}

interface ConsumeOfflinePracticePackResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly receiptId: UUID;
  readonly packId: UUID;
  readonly packHash: Sha256HexV1;
  readonly packStatus: 'consumed';
  readonly packRevision: 2;
  readonly selectionBasisId: UUID;
  readonly selectionBasisHash: Sha256HexV1;
  readonly selectionBasisStatus: 'consumed';
  readonly sessionId: UUID;
  readonly sessionCreatedEventId: UUID;
  readonly sessionCreatedCanonicalHash: Sha256HexV1;
  readonly consumedAt: IsoUtcTimestamp;
}
```

```sql
public.issue_offline_practice_pack_v2(p_request jsonb) returns jsonb
public.consume_offline_practice_pack_v2(p_request jsonb) returns jsonb
```

pack署名preimageは`signature`だけを除いたstrict `OfflinePracticePackV2`のRFC 8785 JCS UTF-8 bytes、`packHash`は署名を含むpack全体のJCS SHA-256です。`items`はordinal 0始まり・欠番/重複0で、question/version重複0、`choiceOrder`は同question choicesのID集合とexact一致します。`PreAnswerQuestionDto`の禁止keyに加えて、pack全階層で`isCorrect/correctChoiceIds/answerKey/explanation/choiceExplanation/takeaway/commonTrap`を拒否します。owner本人、current data generation、active acceptance、bundle/canonical/manifest/selection revision、chapter、current reviewing/published versionをuser shared lockとversion shared lock下で検証し、他owner/public/retired/suspended/revokedを返しません。期限内packは端末へ原子的に保存して完全offline通常sessionのselection basisに使えますが、回答はlocal intent/outboxでありserver採点前に正誤を表示しません。再接続時はconsume RPCがpack ID/hash、basis ID/hashと各versionを再検証し、失効/suspend/revoke/差替えを正答非開示のtombstoneまたはconflictへ収束させます。consume成功後だけ同sessionの回答RPCを送信できます。packをportable export、Web bundle、模試verified draftの根拠へ使いません。

issue RPCは`reservedSessionId`へ結合したpackとselection basisを同一transactionでexact一件ずつ作成し、相互FKと`UNIQUE(pack_id)`, `UNIQUE(selection_basis_id)`, `UNIQUE(reserved_session_id)`で一pack = 一basis = 一reserved sessionを固定します。端末はこのsession IDだけでoffline sessionを作り、別sessionへの複製を拒否します。consume RPCはuser、pack、basisを同じlock順で取得し、未失効`packStatus='issued'/packRevision=1`、basis unconsumed、ID/hash、active acceptance/versionを再検証します。`sessionCreatedEvent.payload.sessionId=reservedSessionId`かつ同eventのselection basis ID/hash、pack ID/hashがrequestとexact一致する場合だけ、session作成、basis consume、pack `consumed/revision=2`、canonical event、append-only receiptを一transactionで確定します。同operation ID・同request hashは保存済みreceiptをbyte-for-byte返し、別hash、別event/session、二回consume、部分commitを拒否します。kill/retryではissued一式またはconsumed一式＋receiptの二状態だけを許可します。

両requestの`operationRequestHash`はそのfield自身だけを除くstrict requestのRFC 8785 JCS SHA-256、両responseの`operationResponseHash`はそのfield自身だけを除くstrict responseの同hashです。issue/consumeはいずれもappend-only receiptへrequest/response bytesと両hashを保存し、同じoperation ID・同hashだけをbyte-for-byte replayします。PUBLIC/anon/service_roleからREVOKEし、`authenticated`本人へだけEXECUTEをgrantして`auth.uid()`、current generation、ownerを検証します。offline用`session.created`は通常8-kind ingestへ送信せず、local outboxの専用`offline-pack-consume` commandとしてconsume RPCへsingleton送信します。通常ingestは`creationSource='offline-practice-pack'`を常に拒否し、consume RPCだけがembedded eventを同じcanonical processorへ内部入力します。consume responseのreceipt・canonical event ID/hashをlocal session/pack/basis/outbox ACKへ一transactionで適用し、不正response、通信切断、receipt未保存時はdomain/ACKを不変にして同operationを再送します。

## 8. Exam RPC

```ts
interface CommandExecutionResponseV2<T> {
  readonly contractVersion: 2;
  readonly currentDataGeneration: DataGeneration;
  readonly disposition: 'current' | 'restored-source-replay';
  readonly sourceDataGeneration: DataGeneration;
  readonly response: T;
}
```

exam submit、session abandon、offline reference、selection basis discardの4 command RPCは必ずこのwrapperを返します。通常確定・通常冪等replayは`disposition='current'`かつ両generation同値です。restore archiveからの保存済みresponseは`restored-source-replay`でsource generationを保持し、`currentDataGeneration`を別に通知します。clientはinner responseをcurrent domainへ適用せず、該当旧command/outboxをACK済み監査行へ移して旧namespaceを隔離し、current generationのfull bootstrapを開始します。この隔離・cursor reset・bootstrap開始を一local transactionで確定します。discard command/factはportable payloadへ含めないcontrol auditであるため、discard responseは`current`だけを許可し、restore archive replay branchを拒否します。

### 8.1 開始

```sql
public.start_exam_session_v2(p_event jsonb)
returns jsonb
```

入力は`SyncEventEnvelopeV2<'session.created'>`で、payloadは`ExamSessionCreatedRequest`です。DBがblueprintから40問を選定し、内部の同期processorを再利用します。

### 8.2 提出

```sql
public.submit_exam_session_v2(p_command jsonb)
returns jsonb
```

```ts
interface SubmitExamCommandV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly sessionId: UUID;
  readonly expectedRevision: number;
}
```

command hashはRFC 8785 JCSによるcommand全体のSHA-256です。同一command ID・同一hashだけを冪等成功とし、異内容を拒否します。`session.submitted`はserver-originated canonical kindであり、generic ingest対象ではありません。
response型は`CommandExecutionResponseV2<SessionSubmittedCanonical>`です。

### 8.3 状態

```sql
public.get_exam_state_v2(
  p_data_generation bigint,
  p_session_id uuid
)
returns jsonb
```

```ts
interface ExamStateResponseV2 {
  readonly contract: 'exam-state.v2';
  readonly dataGeneration: DataGeneration;
  readonly sessionId: UUID;
  readonly examPolicy: ExamPolicy;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly status: SessionStatus;
  readonly startedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly serverNow: IsoUtcTimestamp;
  readonly remainingSeconds: number;
  readonly currentIndex: number;
  readonly submittedAt: IsoUtcTimestamp | null;
  readonly items: readonly {
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly ordinal: number;
    readonly answered: boolean;
    readonly draftRevision: number | null;
    readonly selectedChoiceIds: readonly ChoiceId[];
  }[];
  readonly result: {
    readonly resultRevision: number;
    readonly score: number;
    readonly denominator: number;
    readonly resultStatus: 'valid' | 'invalidated';
    readonly passingScore: 26 | null;
    readonly passed: boolean | null;
  } | null;
}
```

提出前のresultはnullで、正答・解説・各問正誤を返しません。

### 8.4 期限finalizerとoffline参考結果

`answer_drafts.received_at`は各成功保存時にDBが付与するimmutable受信時刻です。session row lock後のwall-clockが期限を超えたdraft writeは既存rowを一切上書きせず、`DraftSavedCanonical.invalidatedReason='exam_input_closed'`の成功canonical eventをappend・ACKし、同じtransactionで期限到達済みfinalizerへ収束します。PostgreSQL exceptionは投げず、outboxは当該ACKとterminal responseを一つのlocal transactionで適用して終了します。期限直前に保存済みの回答を、期限後の同event IDまたは別event IDで空選択・別選択へ差し替えることはできません。

verified finalizerは`received_at <= expires_at`のserver保存済みdraftだけを採点します。draft writeと内部`finalize_exam_session_v2(sessionId, trigger)`はsession row lock取得後に`clock_timestamp()`を一度だけ取得し、その値を`received_at`またはfinalizer wall-clockへ保存して同値で期限判定します。transaction開始時刻である`now()` / `transaction_timestamp()`をdeadline判定に使用しません。内部finalizerはunique `(session_id, finalizer_version='verified-v2')`を取得します。terminal event IDはRFC 4122 DNS namespace `6ba7b810-9dad-11d1-80b4-00c04fd430c8`とUTF-8 name `jstqb-study-app/exam-finalize/verified-v2/<lowercase-session-uuid>`からDBがUUIDv5で生成します。各有効itemのattempt IDも同じnamespaceとUTF-8 name `jstqb-study-app/exam-attempt/verified-v2/<lowercase-session-uuid>/<ordinal>/<versionStableKey>`からUUIDv5で生成します。namespace/name UTF-8 bytesと期待UUIDをliteral fixtureへ固定します。terminal `occurredAt`、`receivedAt`、`submittedAt`もDBだけが付与します。明示submitは期限前にも確定でき、session read/scheduled sweeperはlock取得後の同じwall-clockが`expires_at`以上の時だけ確定します。既にterminalがあれば全経路が同じ保存済みcanonicalを返し、terminal event、item result、attempt、session完了を重複生成しません。lock待ち中に期限を跨ぐdraft、manual submit、read、sweeper競合を実DB試験します。

`submit_offline_exam_reference_v2`は通常syncと別RPCです。期限中にlocal保存されたdraft bundleを別tableへ格納し、`timingAssurance='offline_unverified'`の個人参考結果だけを返します。verified attempt、正式合格、克服、誤答、SRS、定着、章readiness、verified分析、正式session terminal、`session.submitted`canonicalの全table/view/projectionへ混入させません。

```ts
interface SubmitOfflineExamReferenceCommandV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly bundleId: UUID;
  readonly bundleHash: Sha256HexV1;
  readonly sessionId: UUID;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly items: readonly {
    readonly questionId: QuestionId;
    readonly questionVersionId: QuestionVersionId;
    readonly selectedChoiceIds: readonly ChoiceId[];
    readonly localSavedAt: IsoUtcTimestamp | null;
  }[];
}

interface OfflineExamReferenceItemResultV2 {
  readonly ordinal: number;
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
  readonly answered: boolean;
  readonly excluded: boolean;
  readonly isCorrect: boolean | null;
  readonly score: 0 | 1 | null;
}
```

```sql
public.submit_offline_exam_reference_v2(p_command jsonb) returns jsonb
public.get_offline_exam_reference_feedback_v2(
  p_data_generation bigint,
  p_reference_result_id uuid
) returns jsonb
```

submit response型は`CommandExecutionResponseV2<OfflineExamReferenceResultV2>`です。

```ts
interface OfflineExamReferenceFeedbackV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly referenceResultId: UUID;
  readonly sessionId: UUID;
  readonly bundleId: UUID;
  readonly bundleHash: Sha256HexV1;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly timingAssurance: 'offline_unverified';
  readonly resultRevision: NonNegativeSafeIntegerV1;
  readonly feedbackRevision: number;
  readonly items: readonly OfflineReferenceFeedbackItemDto[];
}
```

```ts
interface OfflineExamReferenceResultV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly referenceResultId: UUID;
  readonly sessionId: UUID;
  readonly bundleId: UUID;
  readonly bundleHash: Sha256HexV1;
  readonly examBlueprintVersion: 'exam-blueprint.v1';
  readonly examBlueprintHash: Sha256HexV1;
  readonly timingAssurance: 'offline_unverified';
  readonly contentChannel: ContentChannel;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly score: number;
  readonly denominator: number;
  readonly resultRevision: NonNegativeSafeIntegerV1;
  readonly resultStatus: 'reference_only';
  readonly items: readonly OfflineExamReferenceItemResultV2[];
  readonly createdAt: IsoUtcTimestamp;
}
```

保存済み`examPolicy='allow_offline_reference'`だけを許可し、owner、data generation、content assurance/acceptance、session pin、問題版、choice所属、選択数、exam blueprint version/hashをDBで検証します。itemsはpinned item集合のexact one-to-oneで、未回答は空選択・`localSavedAt=null`です。suspended/revoked itemは得点分母から除外しますが、resultとfeedbackのordinal集合からは除外しません。保存時点で利用不可なら同ordinalを`excluded=true/isCorrect=null/score=null`として保持し、feedbackは正答・解説・choice本文を持たない`UnavailableFeedbackTombstoneDto`を返します。提出後に停止/revokeされた場合は§7のresult/feedback revisionで影響ordinalだけを除外/tombstoneへ収束し、非影響ordinalを保持したままscore/denominatorを再計算します。全revisionで欠落・追加・並替えを禁止します。`bundleHash`はRFC 8785 JCSによる`{schemaVersion:2,sessionId,dataGeneration,examPolicy,examBlueprintVersion,examBlueprintHash,contentAssurance,previewAcceptanceId,previewBundleId,previewCanonicalHash,previewManifestHash,previewSelectionRevision,items:[{ordinal,questionId,questionVersionId,selectedChoiceIds,localSavedAt}]}`のSHA-256で、itemsはordinal昇順、choice IDはstable sortとしserverが再計算します。同じbundle ID・同じcanonical bytes/hashの再送は同じreference resultへ収束し、同じIDの異内容は拒否します。初回はresult/feedback revision 0です。itemごとのanswered/excluded/isCorrect/scoreを別のreference tableへ保存し、提出確定後かつownerだけが専用feedback RPCを取得できます。reference feedbackは正式feedback cacheとnamespaceを分け、attempt・正式projectionを一切更新しません。

## 9. Session終了command

```sql
public.abandon_learning_session_v2(
  p_command jsonb
)
returns jsonb
```

```ts
interface AbandonLearningSessionCommandV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly sessionId: UUID;
  readonly expectedRevision: number;
}

interface AbandonLearningSessionResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly commandId: UUID;
  readonly sessionId: UUID;
  readonly status: 'abandoned';
  readonly revision: number;
  readonly abandonedAt: IsoUtcTimestamp;
}
```

RPC response型は`CommandExecutionResponseV2<AbandonLearningSessionResponseV2>`です。

本人のactive sessionだけを冪等に`abandoned`へ遷移させます。command全体をRFC 8785 JCS hashへ結合し、同一command ID・同一hashだけ保存済みresponseを返します。`SUBMITTING`はlocal transientでDB statusではありません。運用無効化は別の管理RPCでoperation ID、actor、reason、commit/run metadataを必須にします。

## 10. Transaction境界

| 操作 | 同一transaction |
|---|---|
| session作成 | session、全item、pin、choice order、sync event |
| draft | CAS、draft upsert、sync event |
| 通常回答 | 重複検証、attempt、question state、session進捗、sync event |
| position/review | item検証、session revision、sync event |
| 模試提出 | session lock、全draft評価、attempt、question state、全item result、score、session完了、sync event |
| note/bookmark/issue | materialized row、sync event |
| content publish | hash、attestation、version publish、current切替、approval、audit、catalog revision |

batch途中で一件失敗した場合、先行eventだけをcommitしません。

全実装のlock registryと取得順は次の一つだけです。不要な段階はskipできますが、後段取得後に前段へ戻りません。

```text
1. user transaction advisory lock（user scoped mutation/readはshared、restore/deleteはexclusive）
2. question-version row lock（questionVersionId UUID bytes昇順、read/writeはshared）
3. aggregate/event advisory lock（domain tag UTF-8 bytes、aggregate UUID bytes昇順）
4. session row lock（session UUID bytes昇順）
5. attempt row lock（attempt UUID bytes昇順）
6. projection row lock（scope registry順、entity ID bytes昇順）
```

global suspendだけは単一question-versionのexclusive row lockを最初に取得し、同じtransactionでuser lockまたはuser-owned rowを取得しません。suspension fanoutは別transactionで通常順のuser shared → target version shared → session/attempt/projectionを取ります。restore finalizeはuser exclusive取得後、portable payloadが参照する全question versionをUUID bytes昇順にshared lockし、現在suspended/revokedならlive contentを復元せず該当item/attempt/feedbackをtombstone/invalidationへmaterializeしてから後段lockへ進みます。version lockを省略したrestore、version lock後にuser lockを取る経路、複数versionを入力順でlockする経路を禁止します。DB concurrency testは全mutation/finalizer/fanout/restore/deleteのwait graphとtimeout 0を検査します。

## 11. Server-owned learning change feed

client ingest 9契約とは別に、管理訂正・セッションlifecycle・projection再構築を本人端末へ配信します。

`learning_server_change_feed.payload_json`は下記`LearningServerChangeV2`の選択branch全体そのものを保存するDB正本で、`payload_hash=SHA-256(RFC 8785 JCS(payload_json))`です。`offline-reference.feedback-revised`は`resultRevisionId`、`feedbackRevisionId`、`referenceResultId`、連続するresult/feedbackの新旧revision、再計算済み`score/denominator`、`reasonCode/revisedAt/originalItemCount`、影響ordinalだけの`tombstonedOrdinals`、元ordinal集合全件の`resultItems`、影響refだけの`affectedItems`を一件も省略しません。汎用`revisionId`へ両fact IDを縮退、result/feedback片方のみ保存、非影響ordinalの欠落をkind別DB CHECKとstrict JSON schemaで拒否し、SQL/TypeScript/独立fixtureは影響1 ordinal、非影響保持、両revision同時適用を同じliteralから検証します。

```ts
interface LearningServerChangeBaseV2 {
  readonly contractVersion: 2;
  readonly sequence: number;
  readonly userId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly requiredSyncSequence: number;
  readonly contentAssurance: ContentAssurance;
  readonly previewAcceptanceId: UUID | null;
  readonly projectionRevision: number;
  readonly operationId: UUID;
  readonly occurredAt: IsoUtcTimestamp;
}

type LearningServerChangeV2 =
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'attempt.corrected';
      readonly sessionId: UUID;
      readonly attemptId: UUID;
      readonly questionId: QuestionId;
      readonly correctionId: UUID;
      readonly correctionNo: number;
      readonly priorCorrectionId: UUID | null;
      readonly oldOutcome: boolean;
      readonly effectiveOutcome: boolean;
      readonly reasonCode: AttemptCorrectionReasonCodeV2;
      readonly correctedAt: IsoUtcTimestamp;
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'attempt.invalidated';
      readonly sessionId: UUID;
      readonly attemptId: UUID;
      readonly questionId: QuestionId;
      readonly invalidationId: UUID;
      readonly reasonCode: AttemptInvalidationReasonCodeV2;
      readonly invalidatedAt: IsoUtcTimestamp;
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'session.item-invalidated';
      readonly fact: PortableSessionItemInvalidationFactV2;
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'projection.rebuilt';
      readonly affectedQuestionIds: readonly QuestionId[];
      readonly requiresProjectionPull: true;
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'session.completed';
      readonly lifecycleFactId: UUID;
      readonly sessionId: UUID;
      readonly status: 'completed';
      readonly revision: number;
      readonly terminalAt: IsoUtcTimestamp;
      readonly reasonCode: 'all_answerable_items_completed';
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'session.abandoned';
      readonly lifecycleFactId: UUID;
      readonly sessionId: UUID;
      readonly status: 'abandoned';
      readonly revision: number;
      readonly terminalAt: IsoUtcTimestamp;
      readonly reasonCode: 'user_abandoned';
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'session.invalidated';
      readonly lifecycleFactId: UUID;
      readonly sessionId: UUID;
      readonly status: 'invalidated';
      readonly revision: number;
      readonly terminalAt: IsoUtcTimestamp;
      readonly reasonCode: 'question_suspended' | 'acceptance_revoked' | 'operation_invalidated';
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'exam.result-revised';
      readonly revisionId: UUID;
      readonly sessionId: UUID;
      readonly resultRevision: number;
      readonly priorResultRevision: number;
      readonly score: number;
      readonly denominator: number;
      readonly passingScore: 26 | null;
      readonly passed: boolean | null;
      readonly resultStatus: 'valid' | 'invalidated';
      readonly reasonCode: 'question_suspended' | 'answer_corrected' | 'attempt_invalidated';
      readonly revisedAt: IsoUtcTimestamp;
      readonly items: readonly ExamAttemptSummaryDto[];
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'content.acceptance-revoked';
      readonly revocationId: UUID;
      readonly acceptanceId: UUID;
      readonly affectedSessionIds: readonly UUID[];
      readonly reasonCode: 'acceptance_revoked';
      readonly revocationReasonCode: 'owner_revoked' | 'acceptance_replaced' | 'operation_revoked';
      readonly revokedAt: IsoUtcTimestamp;
    })
  | (LearningServerChangeBaseV2 & {
      readonly kind: 'offline-reference.feedback-revised';
      readonly resultRevisionId: UUID;
      readonly feedbackRevisionId: UUID;
      readonly referenceResultId: UUID;
      readonly resultRevision: PositiveSafeIntegerV1;
      readonly priorResultRevision: NonNegativeSafeIntegerV1;
      readonly feedbackRevision: number;
      readonly priorFeedbackRevision: number;
      readonly score: NonNegativeSafeIntegerV1;
      readonly denominator: NonNegativeSafeIntegerV1;
      readonly reasonCode: 'question_suspended' | 'acceptance_revoked';
      readonly revisedAt: IsoUtcTimestamp;
      readonly originalItemCount: PositiveSafeIntegerV1;
      readonly tombstonedOrdinals: NonEmptyReadonlyArray<NonNegativeSafeIntegerV1>;
      readonly resultItems: readonly OfflineExamReferenceItemResultV2[];
      readonly affectedItems: NonEmptyReadonlyArray<{
        readonly questionId: QuestionId;
        readonly questionVersionId: QuestionVersionId;
        readonly ordinal: number;
      }>;
    })
  | (LearningServerChangeBaseV2 & ContentIssueTransitionV2 & {
      readonly kind: 'issue.updated';
      readonly issueUpdateFactId: UUID;
      readonly issueId: UUID;
      readonly questionId: QuestionId;
      readonly questionVersionId: QuestionVersionId;
      readonly revision: number;
      readonly priorUpdateFactId: UUID | null;
      readonly reason: NonEmptyTrimmedStringV1;
      readonly updatedAt: IsoUtcTimestamp;
    });

interface PullLearningServerChangesResponseV2 {
  readonly contractVersion: 2;
  readonly contract: 'learning-server-change-pull.v2';
  readonly dataGeneration: DataGeneration;
  readonly snapshotUpperBound: number;
  readonly nextCursor: number;
  readonly hasMore: boolean;
  readonly changes: readonly LearningServerChangeV2[];
}

interface SuspendFanoutTargetMemberBaseV2 {
  readonly targetMemberId: UUID;
  readonly suspendOperationId: UUID;
  readonly userId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly sourceCommittedAt: IsoUtcTimestamp;
  readonly targetPayloadHash: Sha256HexV1;
}

type SuspendFanoutTargetMemberV2 =
  | (SuspendFanoutTargetMemberBaseV2 & {
      readonly targetKind: 'session_item';
      readonly targetKey: UUID;
      readonly sessionItemId: UUID;
      readonly effectiveSourceId: UUID;
      readonly effectiveSourceHash: Sha256HexV1;
      readonly sessionId: UUID;
      readonly questionId: QuestionId;
      readonly ordinal: number;
      readonly sessionStatusAtFreeze: SessionStatus;
    })
  | (SuspendFanoutTargetMemberBaseV2 & {
      readonly targetKind: 'answer_attempt';
      readonly targetKey: UUID;
      readonly attemptId: UUID;
      readonly effectiveSourceId: UUID;
      readonly effectiveSourceHash: Sha256HexV1;
      readonly sessionId: UUID;
      readonly gradingStatusAtFreeze: 'graded';
    })
  | (SuspendFanoutTargetMemberBaseV2 & {
      readonly targetKind: 'exam_result_revision';
      readonly targetKey: string;
      readonly sessionId: UUID;
      readonly effectiveSourceId: UUID;
      readonly effectiveSourceHash: Sha256HexV1;
      readonly resultRevisionAtFreeze: number;
    })
  | (SuspendFanoutTargetMemberBaseV2 & {
      readonly targetKind: 'offline_reference_result';
      readonly targetKey: UUID;
      readonly referenceResultId: UUID;
      readonly effectiveSourceId: UUID;
      readonly effectiveSourceHash: Sha256HexV1;
      readonly effectiveFeedbackRevisionId: UUID;
      readonly effectiveFeedbackRevisionHash: Sha256HexV1;
      readonly resultRevisionAtFreeze: number;
      readonly feedbackRevisionAtFreeze: number;
    });

interface ContentSuspendOperationV2 {
  readonly suspendOperationId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly operationPrincipalSnapshotId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly workerName: 'suspension-fanout';
  readonly pinnedWorkerVersion: NonEmptyTrimmedStringV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly executionContractHash: Sha256HexV1;
  readonly targetUserCount: NonNegativeSafeIntegerV1;
  readonly targetMemberCount: NonNegativeSafeIntegerV1;
  readonly targetSetHash: Sha256HexV1;
  readonly frozenAt: IsoUtcTimestamp;
  readonly status: 'pending' | 'running' | 'retry_wait' | 'completed' | 'dead_lettered';
}

interface SuspendFanoutTargetSetV2 {
  readonly suspendOperationId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly workerName: 'suspension-fanout';
  readonly pinnedWorkerVersion: NonEmptyTrimmedStringV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly executionContractHash: Sha256HexV1;
  readonly targetUserCount: NonNegativeSafeIntegerV1;
  readonly targetMemberCount: NonNegativeSafeIntegerV1;
  readonly targetSetHash: Sha256HexV1;
  readonly frozenAt: IsoUtcTimestamp;
  readonly members: readonly SuspendFanoutTargetMemberV2[];
}

interface SuspendFanoutUserReceiptV2 {
  readonly suspendOperationId: UUID;
  readonly userId: UUID;
  readonly expectedMemberCount: PositiveSafeIntegerV1;
  readonly appliedMemberCount: PositiveSafeIntegerV1;
  readonly sessionItemCount: NonNegativeSafeIntegerV1;
  readonly attemptCount: NonNegativeSafeIntegerV1;
  readonly examResultCount: NonNegativeSafeIntegerV1;
  readonly offlineReferenceCount: NonNegativeSafeIntegerV1;
  readonly userMemberSetHash: Sha256HexV1;
  readonly completedAt: IsoUtcTimestamp;
  readonly workerName: 'suspension-fanout';
  readonly pinnedWorkerVersion: NonEmptyTrimmedStringV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly executionContractHash: Sha256HexV1;
}

type SuspendFanoutMaterializationLinkV2 = {
  readonly linkId: UUID;
  readonly suspendOperationId: UUID;
  readonly targetMemberId: UUID;
  readonly userId: UUID;
  readonly materializedAt: IsoUtcTimestamp;
  readonly serverChangeSequences: NonEmptyReadonlyArray<PositiveSafeIntegerV1>;
  readonly linkHash: Sha256HexV1;
} & (
  | {
      readonly targetKind: 'session_item';
      readonly sessionItemInvalidationFactId: UUID;
      readonly sessionItemInvalidationFactHash: Sha256HexV1;
      readonly attemptInvalidationId: null;
      readonly examResultRevisionId: null;
      readonly offlineResultRevisionId: null;
      readonly offlineFeedbackRevisionId: null;
    }
  | {
      readonly targetKind: 'answer_attempt';
      readonly sessionItemInvalidationFactId: null;
      readonly sessionItemInvalidationFactHash: null;
      readonly attemptInvalidationId: UUID;
      readonly examResultRevisionId: null;
      readonly offlineResultRevisionId: null;
      readonly offlineFeedbackRevisionId: null;
    }
  | {
      readonly targetKind: 'exam_result_revision';
      readonly sessionItemInvalidationFactId: null;
      readonly sessionItemInvalidationFactHash: null;
      readonly attemptInvalidationId: null;
      readonly examResultRevisionId: UUID;
      readonly offlineResultRevisionId: null;
      readonly offlineFeedbackRevisionId: null;
    }
  | {
      readonly targetKind: 'offline_reference_result';
      readonly sessionItemInvalidationFactId: null;
      readonly sessionItemInvalidationFactHash: null;
      readonly attemptInvalidationId: null;
      readonly examResultRevisionId: null;
      readonly offlineResultRevisionId: UUID;
      readonly offlineFeedbackRevisionId: UUID;
    }
);

type ContentControlOperationKindV2 = 'stage' | 'publish' | 'suspend' | 'retire';

interface ControlledPrivateReleaseArtifactV2 {
  readonly artifactId: UUID;
  readonly environment: 'production';
  readonly bucket: 'controlled-private-release';
  readonly objectKey: NonEmptyTrimmedStringV1;
  readonly objectVersion: NonEmptyTrimmedStringV1;
  readonly etag: NonEmptyTrimmedStringV1;
  readonly sizeBytes: PositiveSafeIntegerV1;
  readonly contentType: 'application/json';
  readonly rawSha256: Sha256HexV1;
  readonly verificationStatus: 'verified' | 'rejected';
  readonly verifiedByPrincipalSnapshotId: UUID;
  readonly verifiedAt: IsoUtcTimestamp;
  readonly createdAt: IsoUtcTimestamp;
}

type ContentControlJobBaseV2 = {
  readonly jobId: UUID;
  readonly operationId: UUID;
  readonly targetId: NonEmptyTrimmedStringV1;
  readonly targetHash: Sha256HexV1;
  readonly operationPrincipalSnapshotId: UUID;
  readonly internalRequestHash: Sha256HexV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly createdAt: IsoUtcTimestamp;
};

type ContentControlJobV2 = ContentControlJobBaseV2 & (
  | {
      readonly operationKind: 'stage' | 'publish';
      readonly targetKind: 'content-release-manifest';
      readonly humanOperationId: null;
      readonly enqueueReceiptId: null;
    }
  | {
      readonly operationKind: 'suspend' | 'retire';
      readonly targetKind: 'question-version';
      readonly humanOperationId: UUID;
      readonly enqueueReceiptId: UUID;
    }
) & (
  | { readonly status: 'queued' | 'claimed'; readonly completedAt: null }
  | { readonly status: 'completed' | 'failed' | 'dead_lettered'; readonly completedAt: IsoUtcTimestamp }
);

interface ContentControlExecutionClaimV2<K extends ContentControlOperationKindV2 = ContentControlOperationKindV2> {
  readonly claimId: UUID;
  readonly jobId: UUID;
  readonly operationId: UUID;
  readonly operationKind: K;
  readonly targetId: NonEmptyTrimmedStringV1;
  readonly targetHash: Sha256HexV1;
  readonly operationPrincipalSnapshotId: UUID;
  readonly internalRequestHash: Sha256HexV1;
  readonly leaseOwnerId: UUID;
  readonly leaseExpiresAt: IsoUtcTimestamp;
  readonly leaseFencingToken: PositiveSafeIntegerV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly claimedAt: IsoUtcTimestamp;
  readonly releasedAt: null;
}

type EnqueueQuestionLifecycleOperationRequestV2 = {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly expectedRevision: PositiveSafeIntegerV1;
} & (
  | {
      readonly action: 'suspend';
      readonly expectedStatus: 'reviewing' | 'published' | 'retired';
      readonly reason: NonEmptyTrimmedStringV1;
    }
  | {
      readonly action: 'retire';
      readonly expectedStatus: 'reviewing' | 'published';
      readonly reason: 'retired';
    }
);

interface EnqueueQuestionLifecycleOperationResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly humanRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly enqueueReceiptId: UUID;
  readonly internalOperationId: UUID;
  readonly contentControlJobId: UUID;
  readonly action: 'suspend' | 'retire';
  readonly questionVersionId: QuestionVersionId;
  readonly requestedByPrincipalSnapshotId: UUID;
  readonly requestedAt: IsoUtcTimestamp;
  readonly status: 'queued';
}

interface SuspendQuestionVersionRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly enqueueReceiptId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly expectedStatus: 'reviewing' | 'published' | 'retired';
  readonly expectedRevision: PositiveSafeIntegerV1;
  readonly reason: NonEmptyTrimmedStringV1;
  readonly executionClaim: ContentControlExecutionClaimV2<'suspend'>;
}

interface SuspendQuestionVersionResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly operationPrincipalSnapshotId: UUID;
  readonly suspendOperationId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly priorStatus: 'reviewing' | 'published' | 'retired';
  readonly status: 'suspended';
  readonly revision: PositiveSafeIntegerV1;
  readonly frozenAt: IsoUtcTimestamp;
  readonly pinnedWorkerVersion: NonEmptyTrimmedStringV1;
  readonly runtimeCapabilitySnapshotId: UUID;
  readonly runtimeCapabilitySnapshotHash: Sha256HexV1;
  readonly executionContractHash: Sha256HexV1;
  readonly targetUserCount: NonNegativeSafeIntegerV1;
  readonly targetMemberCount: NonNegativeSafeIntegerV1;
  readonly targetSetHash: Sha256HexV1;
  readonly fanoutStatus: 'pending';
}

interface RetireQuestionVersionRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly enqueueReceiptId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly expectedStatus: 'reviewing' | 'published';
  readonly expectedRevision: PositiveSafeIntegerV1;
  readonly reason: 'retired';
  readonly executionClaim: ContentControlExecutionClaimV2<'retire'>;
}

interface RetireQuestionVersionResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly operationPrincipalSnapshotId: UUID;
  readonly questionVersionId: QuestionVersionId;
  readonly priorStatus: 'reviewing' | 'published';
  readonly status: 'retired';
  readonly revision: PositiveSafeIntegerV1;
  readonly catalogRevision: PositiveSafeIntegerV1;
  readonly catalogTombstone: CatalogTombstoneDto & { readonly reason: 'retired' };
  readonly retiredAt: IsoUtcTimestamp;
}
```

```sql
public.pull_learning_server_changes_v2(
  p_data_generation bigint,
  p_after_sequence bigint,
  p_limit integer default 100,
  p_snapshot_upper_bound bigint default null
) returns jsonb

public.enqueue_question_lifecycle_operation_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb

private.update_content_issue_v2(
  p_issue_id uuid,
  p_expected_revision bigint,
  p_status text,
  p_resolution text,
  p_reason text,
  p_operation_id uuid
) returns jsonb

private.suspend_question_version_v2(p_request jsonb) returns jsonb
private.retire_question_version_v2(p_request jsonb) returns jsonb
```

human lifecycle enqueueの`humanRequestHash=SHA-256(JCS({request: strict EnqueueQuestionLifecycleOperationRequestV2,requestedByPrincipalSnapshotId}))`です。secret reauth grant token、server発行internal operation/job、worker principal、claim/lease/fencingをpreimageへ含めません。human enqueue receiptはresolved reauth grant IDを別列へ一回消費の証跡として保持しますが、保存済みreceipt replay時にgrantを再要求しません。

本人stream、generation、snapshot上限、paginationと入力境界はsync pullと同じです。初回はDBが本人streamの`max(sequence)`をsnapshot上限へ固定し、継続pageは同じ上限だけを受理します。負数、current maxより未来のafter/upper、`after > upper`、継続中のupper差替えをRPCで拒否します。正答・解説を含めません。clientは全responseをstrictに検証し、changeの`requiredSyncSequence`までsync streamを先に適用してから、local attempt/state/session更新、exam実効結果、feedback purge、projection、server-change cursorを一transactionで適用します。依存sync未取得またはresponse不正なら何も適用しません。

issue管理RPCはPUBLIC/anon/authenticated/service_roleからREVOKEし、専用content-control role、管理者principal snapshot、対象owner shared lock、expected revision、operation ID、trim後1～2,000文字のreasonを必須にします。許可遷移は`open -> investigating|resolved|rejected`と`investigating -> resolved|rejected`だけです。`resolved|rejected`はterminalで、reopen、terminal間遷移、same-state更新を禁止します。`open|investigating`は`resolution=null`、`resolved|rejected`はtrim後1～2,000文字のresolutionを必須とし、旧status/revision不一致は`REVISION_CONFLICT`、禁止遷移は`INVALID_ENVELOPE`で全件rollbackします。同一operation ID・全入力一致だけを保存済みresponseによる冪等成功にし、別hashを拒否します。更新factは一意な`issueUpdateFactId`、直前factへの`priorUpdateFactId`、old/new status・resolution、reasonを持ち、初回更新だけ`priorUpdateFactId=null`、以後は直前fact IDとexact一致させます。更新fact、materialized issue、owner向け`issue.updated` change、operation auditを同一transactionで確定します。

`enqueue_question_lifecycle_operation_v2`はowner/adminのauthenticated本人だけへgrantし、`auth.uid()`、purpose/target/actionへ結合したfresh reauth grant、expected status/revision、suspendではtrim後1～2,000文字のreason、retireではliteral `reason='retired'`を検証します。初回成功transactionでhuman enqueue receipt、human `operationId`とは異なるserver-owned `internalOperationId`、create-only `ContentControlJobV2`を同時に作り、grantをexact一回consumeします。responseは`enqueueReceiptId/internalOperationId/contentControlJobId`を明示結合し、`operationResponseHash=SHA-256(JCS(strict responseからoperationResponseHashだけを除いたprojection))`を返してDB enqueue receiptの`human_response_hash`とexact一致させます。DBは保存するstrict `human_response_json`内の`operationResponseHash`とこの生成hashをexact一致させ、hash計算へ`operationResponseHash`自身を含める実装を拒否します。human receiptは`requestedByPrincipalSnapshotId`と`humanRequestHash`、job/claim/internal receiptはworkerの`operationPrincipalSnapshotId`と`internalRequestHash`をそれぞれ保持し、両principalまたは両hashの同値を要求しません。jobでは`operationId=internalOperationId`、`humanOperationId=request.operationId`とし、両IDの同値を拒否します。human receiptとinternal jobのdeferred exact一対一結合対象はhuman/internal operation ID、enqueue/job ID、kind、target、およびserverがhuman requestから決定的に写像したexpected status/revision/reasonです。同じhuman operation ID・同じhuman request hash・同じrequested-by principalだけ保存responseを返し、別内容を拒否します。authenticated UIはこのenqueue RPCだけを呼び、internal RPC、claim、Storage tupleへ到達しません。

`suspend_question_version_v2`と`retire_question_version_v2`は`content_control` NOLOGIN execution roleだけへEXECUTEをgrantし、PUBLIC/anon/authenticated/service_role/他専用roleからREVOKEします。worker LOGIN roleはこの一roleへだけ`SET LOCAL ROLE`でき、DB保存済みjob/claimのjob ID、internal operation ID、kind、target ID/hash、operation principal snapshot、internal logical request hash、runtime capability snapshot ID/hash、lease owner、`leaseExpiresAt > clock_timestamp()`、単調fencing tokenをrequestとexact照合します。suspend/retireはenqueue receipt、job、claimが同じhuman request target/actionとserver-owned internal operation IDへ結合する場合だけ初回実行します。enqueue receipt、job、internal operation、初回operation receiptは各々exact一件のdeferred FK/UNIQUE chainとし、stage/publish jobでは`humanOperationId/enqueueReceiptId=null`、suspend/retireでは両方non-nullかつhuman/internal operation ID不一致をCHECKします。ただしhumanのrequested-by principal/request hashとinternal worker principal/request hashは別正本であり、相互同値制約を置きません。internal operationの`resolvedReauthGrantId`はnullで、human reauth grantを複製・再消費しません。version exclusive lock取得後にexpected status/revisionを再検証し、suspend理由はtrim後1～2,000文字、retire理由はliteral `retired`を要求します。retireは`reviewing|published -> retired`だけで既存pinを維持し、status/revisionと同じtransactionで対象catalog streamへ`reason='retired'`のmembership removal tombstoneをexact一件appendし、catalog revisionをexact 1増加させます。session/basis/feedbackのinvalidation tombstone、suspend operation、fanout target、materialization linkは0件です。append-only audit、strict operation receiptまで原子的に確定します。suspendは`reviewing|published|retired -> suspended`だけを許可します。

stage/publish/suspend/retire共通のinternal `operationRequestHash`（job/claim列名は`internalRequestHash`）は`SHA-256(JCS({operationKind,logicalRequestWithoutExecutionClaim,operationPrincipalSnapshotId,resolvedReauthGrantId:null}))`です。lease更新可能な`executionClaim`をpreimageへ含めず、claimの`internalRequestHash`はjobへ保存した同じinternal logical request hashとexact一致させます。`operationResponseHash`は同field自身だけを除くstrict response JCSのSHA-256です。internal RPCは専用role ACLを確認した直後、operation ID/kind/principal/internal request hashでappend-only receiptを先に検索し、完全一致があれば現在のlease期限、claim freshness、fencing tokenを再検証・再消費せず、保存済みresponse bytesをbyte-for-byte返します。receiptがない初回だけjob/claim、未期限lease、最新fencing、capabilityを検証します。別hash、別principal、別kindは保存receiptの有無にかかわらず全件rollbackします。suspend responseの`fanoutStatus='pending'`は内部`ContentSuspendOperationV2.status='pending'`へ一意に対応し、`pending -> running`、`running -> retry_wait|completed|dead_lettered`、`retry_wait -> running|dead_lettered`だけを許可します。completed/dead-letteredはterminalでsame-state更新を含む他遷移を拒否します。retireはfanoutを作りません。

`PortableSessionItemInvalidationFactV2.factHash=SHA-256(RFC 8785 JCS(factHashだけを除くstrict fact))`です。`session.item-invalidated` changeはこのfactをnested `fact`としてbyte-exactに持ち、outer `operationId/occurredAt`は`fact.operationId/invalidatedAt`と一致させます。local `sessionItemInvalidationHistory`、stale-generation専用row、bootstrap、portable export、restore materialization、suspend materialization linkは同じfact ID/hash、session item/session/question/version、reason、operation/timeを保持し、再発行、別memberへの再利用、ID一致hash不一致を拒否します。各lifecycle changeは同じtransactionでappendした`PortableSessionLifecycleFactV2`と同一の`lifecycleFactId/sessionId/revision/operationId/terminalAt/status/reasonCode`を持ち、completed理由をnullへ縮退しません。`exam.result-revised`は`PortableExamResultRevisionFactV2`と同一の`revisionId/sessionId/resultRevision/priorResultRevision/operationId/revisedAt/items`を含み、端末がchangeだけでappend-only revision factと実効結果を再構築できなければなりません。`content.acceptance-revoked`はportable revocationと同じ`revocationId/acceptanceId/revocationReasonCode/revokedAt/operationId`を持ちます。`offline-reference.feedback-revised`は同じtransactionのresult revision factとfeedback revision factの両ID、連続result/feedback revision、時刻、実効score/denominator/全result items、`originalItemCount/tombstonedOrdinals/affectedItems`をlosslessに持ちます。`tombstonedOrdinals`は影響ordinalだけで、result items・feedback responseはいずれも元の全ordinalを保持します。`issue.updated`は管理更新のappend-only factと同じ`issueUpdateFactId/priorUpdateFactId/revision/oldStatus/newStatus/oldResolution/newResolution/reason/updatedAt`を持ち、ownerのlocal issue current projectionと`issueUpdateHistory`へlosslessに適用します。これらのID/値がbootstrap、portable export、change feedで一つでも異なれば整合性errorとしてfail-closedにします。

normal completion、abandoned、invalidated、acceptance revoke、post-terminal exam revision、issue updateを別端末へ収束させ、terminal後の全writeを拒否します。問題suspendのglobal transactionはversion exclusive lock取得後にDB `clock_timestamp()`を一度だけ`frozenAt`へ固定し、version status、catalog tombstone、append-only suspend operation、`SuspendFanoutTargetSetV2`だけを原子的に確定して複数user lockを保持しません。同transactionでproduction capabilityから`workerName='suspension-fanout'`のexact `pinnedWorkerVersion`、snapshot ID、署名検証済みsnapshot hashをoperation/target setへpinします。`executionContractHash=SHA-256(JCS({targetSetHash,pinnedWorkerVersion,runtimeCapabilitySnapshotId,runtimeCapabilitySnapshotHash}))`だけを正本preimageとし、question version、frozen time、worker nameは`targetSetHash`が既に拘束するため重複追加しません。実装別の別preimageやfield aliasを禁止し、retry/deployで変更しません。

target predicateは停止versionへ結合したfreeze時点の実効値だけです。session itemは未invalidatedかつanswerableなpin、answer attemptは`gradingStatusAtFreeze='graded'`かつ既存invalidationなしの実効attempt、examはsessionごとの最新`effective_exam_results` revision exact 1件、offline referenceは最新実効result revisionとそれに対応する最新feedback revisionのexact pair 1件だけを対象にします。過去exam/offline revision、既無効attempt、`not_graded_suspended|not_graded_acceptance_revoked`、旧offline pairを除外します。各memberは実効source ID/hashを持ち、offline branchはfeedback revision ID/hashも持ちます。これらがfreeze時の実効viewと一致しないmemberを拒否します。さらにimmutable `sourceCommittedAt <= frozenAt`かつ同operation/memberの`SuspendFanoutMaterializationLinkV2`不存在を要求します。`sourceCommittedAt`の正本はsession item=`learning_session_items.created_at`、answer attempt=`answer_attempts.received_at`、exam result revision=初回revision 0はserver terminal `submitted_at`・後続revisionはappend-only result revision `revised_at`、offline reference result=初回revision 0は`created_at`・後続revisionはappend-only result revision `revised_at`で、すべて対象行と同transactionでDB `clock_timestamp()`から確定したimmutable UTC時刻です。

各実効target keyごとにexact一件をfreezeし、同一target keyの既materialize行を再登録しません。`targetMemberId`はRFC 4122 DNS namespaceとUTF-8 name `jstqb-study-app/suspend-target-v2/<operation-uuid>/<target-kind>/<target-key>`からUUIDv5で生成し、literal vectorへ固定します。target keyはsession item ID、attempt ID、exam session ID、offline reference result IDの各実効aggregate主識別子とし、revisionをtarget keyへ混ぜて同aggregateの過去revisionを複数targetにしません。memberは`(user UUID bytes,targetKind registry ordinal,targetKey UTF-8 bytes,targetMemberId UUID bytes)`順、`targetSetHash=SHA-256(RFC 8785 JCS({suspendOperationId,questionVersionId,workerName,pinnedWorkerVersion,runtimeCapabilitySnapshotId,runtimeCapabilitySnapshotHash,frozenAt,members}))`で、hash field自身とcountをpreimageから除外します。`targetMemberCount=members.length`、`targetUserCount=distinct userId数`とし、DB operationの両countとexact一致させます。各`targetPayloadHash`は当該memberから同field自身だけを除いたstrict branchのJCS hashです。user subset hashは`SHA-256(RFC 8785 JCS({suspendOperationId,userId,workerName,pinnedWorkerVersion,runtimeCapabilitySnapshotId,runtimeCapabilitySnapshotHash,members:userSubset}))`で、subsetも同じ順序、receiptのexpected/applied countとkind別4 countの合計はsubset lengthです。workerは保存済みmember以外を対象探索のために再scanせず、memberが指す現在行を同一性・冪等性確認にだけ参照します。global commit後に到着したanswer/draft/finalizerはversion shared lock取得後のsuspended検査で同じtransaction内に無採点invalidation/tombstoneとcanonical responseを確定し、graded attemptや正答feedbackを作らずfanout対象にも追加しません。これによりtarget集合は閉じています。

以後すべてのdraft/answer/finalizer/feedback/owned-content RPCはglobal suspended statusを最初に検査して即時拒否またはtombstoneを返します。専用suspension-fanout workerはuser UUID昇順に一人ずつshared user lockを取得し、そのuserのtarget memberを同一transactionで冪等適用して各memberの`SuspendFanoutMaterializationLinkV2`と`SuspendFanoutUserReceiptV2`をappendします。linkはoperation/memberでexact一件、memberと同じuser/kind/effective source ID/hash、kind別の新規結果identity、その結果と同transactionでappendしたserver change sequenceを持ち、`linkHash=SHA-256(JCS(linkHashだけを除くstrict branch))`です。session item branchはappend-only factの`sessionItemInvalidationFactId/sessionItemInvalidationFactHash`を両方持ち、同じmember、operation、session itemへexact FK/CHECK結合します。receiptは対象userごと・operationごとにexact一件で、`sessionItemCount/attemptCount/examResultCount/offlineReferenceCount`は4つの`targetKind`別subset件数、4 countの合計と`expectedMemberCount`と`appliedMemberCount`はuser subset lengthにexact一致し、`userMemberSetHash`は保存済みsubsetから再計算します。receiptの`workerName='suspension-fanout'`、`pinnedWorkerVersion`、capability snapshot ID/hash、`executionContractHash`はoperationのpin値とexact一致させ、claim時とcomplete時に再検証してretryで変更しません。session item/attempt、exam revision、offline-reference result/feedback revision、lifecycle/change、projection、feedback purgeの必要な全作用をmemberから導出し、失敗userだけをretryします。operation完了はmaterialization link件数とその`targetMemberId`集合がtarget member全件にexact一致し、receipt件数が`targetUserCount`、全receiptの`expectedMemberCount`合計が`targetMemberCount`、user集合とmember集合の和集合がtarget setにexact一致し、重複・未処理member 0、全link/receipt hash/count/worker/capability/execution contract pin再検証成功の場合だけ許可します。target userが0ならlink/receipt/target member 0件で完了し、memberがあるのにuser 0、空subset receipt、別versionまたは別capability receiptを拒否します。clientはitem invalidation fact ID/hash、依存outboxの`SUPERSEDED_SERVER_INVALIDATED`化、本文・feedback purge、completion再計算、change cursorを同じlocal transactionで適用します。

```sql
public.get_learning_projection_v2(
  p_request jsonb
) returns jsonb
```

```ts
interface UserQuestionProjectionDtoV2 {
  readonly questionId: QuestionId;
  readonly stateQuestionVersionId: QuestionVersionId;
  readonly wrongEver: boolean;
  readonly latestOutcome: 'correct' | 'incorrect' | null;
  readonly consecutiveCorrectAfterWrong: number;
  readonly recoveredAt: IsoUtcTimestamp | null;
  readonly reviewStage: 0 | 1 | 2 | 3 | 4 | 5;
  readonly remediationDueAt: IsoUtcTimestamp | null;
  readonly nextReviewAt: IsoUtcTimestamp | null;
  readonly masteredAt: IsoUtcTimestamp | null;
  readonly needsRevalidation: boolean;
  readonly firstAttemptAt: IsoUtcTimestamp;
  readonly lastAttemptAt: IsoUtcTimestamp;
  readonly lastAttemptId: UUID;
  readonly attemptCount: number;
  readonly correctCount: number;
}

interface DailyActivityProjectionDtoV2 {
  readonly localDate: string;
  readonly timezoneAtReceipt: string;
  readonly attemptCount: number;
  readonly correctCount: number;
  readonly studySeconds: number;
}

interface UpdateProfileSettingsRequestV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly expectedRevision: number;
  readonly timezone: string;
  readonly settings: PortableProfileSettingsV2;
}

interface UpdateProfileSettingsResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly revision: number;
  readonly timezone: string;
  readonly settings: PortableProfileSettingsV2;
  readonly updatedAt: IsoUtcTimestamp;
}

type GetLearningProjectionRequestV2 = {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly certificationCode: 'CTFL';
  readonly syllabusVersion: 'JSTQB-FL-2023V4.0.J02';
} & (
  | { readonly scope: 'published'; readonly acceptanceId: null }
  | { readonly scope: 'personal-preview'; readonly acceptanceId: UUID }
);

interface ChapterAnalyticsSourceUpperV1 {
  readonly attemptSequenceUpper: NonNegativeSafeIntegerV1;
  readonly attemptCommittedAtUpper: IsoUtcTimestamp;
  readonly catalogRevisionUpper: NonNegativeSafeIntegerV1;
  readonly srsProjectionRevisionUpper: NonNegativeSafeIntegerV1;
  readonly sourceUpperHash: Sha256HexV1;
}

interface ChapterProgressItemV1 {
  readonly chapterNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly officialQuestionCount: 8 | 6 | 4 | 11 | 9 | 2;
  readonly availablePublishedCount: NonNegativeSafeIntegerV1;
  readonly uniqueAnsweredCount: NonNegativeSafeIntegerV1;
  readonly uniqueFirstAttemptCount: NonNegativeSafeIntegerV1;
  readonly uniqueFirstCorrectCount: NonNegativeSafeIntegerV1;
  readonly recoveredCount: NonNegativeSafeIntegerV1;
  readonly everWrongCount: NonNegativeSafeIntegerV1;
  readonly retainedCount: NonNegativeSafeIntegerV1;
  readonly srsEligibleCount: NonNegativeSafeIntegerV1;
  readonly overdueCount: NonNegativeSafeIntegerV1;
  readonly readinessSampleThreshold: PositiveSafeIntegerV1;
  readonly readinessStatus: 'data-insufficient' | 'estimated';
  readonly lower95BasisPoints: NonNegativeSafeIntegerV1 | null;
  readonly safeLostMilliPoints: NonNegativeSafeIntegerV1 | null;
  readonly priorityMilliUnits: NonNegativeSafeIntegerV1 | null;
}

interface ChapterProgressSnapshotV1 {
  readonly schemaVersion: 'chapter-progress-snapshot.v1';
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: UUID | null;
  readonly officialExamStructureBasisHash: Sha256HexV1;
  readonly formulaHash: Sha256HexV1;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly calculatedAt: IsoUtcTimestamp;
  readonly chapters: readonly [
    ChapterProgressItemV1, ChapterProgressItemV1, ChapterProgressItemV1,
    ChapterProgressItemV1, ChapterProgressItemV1, ChapterProgressItemV1
  ];
  readonly snapshotHash: Sha256HexV1;
}

interface LearningProjectionSnapshotV2 {
  readonly schemaVersion: 'learning-projection-snapshot.v2';
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: UUID | null;
  readonly projectionRevision: NonNegativeSafeIntegerV1;
  readonly officialExamStructureBasisHash: Sha256HexV1;
  readonly formulaHash: Sha256HexV1;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly questionProjections: readonly UserQuestionProjectionDtoV2[];
  readonly dailyProjections: readonly DailyActivityProjectionDtoV2[];
  readonly chapterProgress: ChapterProgressSnapshotV1;
  readonly validCompletedExamCount: NonNegativeSafeIntegerV1;
  readonly requiredCompletedExamCount: 2;
  readonly status: 'data-insufficient' | 'estimated';
  readonly ttlPolicyVersion: 'learning-projection-snapshot-ttl.v1';
  readonly calculatedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly snapshotHash: Sha256HexV1;
}

interface ChapterReadinessRequestV2 {
  readonly projectionSnapshotHash: Sha256HexV1;
}

interface ExamReadinessSnapshotV1 {
  readonly schemaVersion: 'exam-readiness-snapshot.v1';
  readonly scope: 'published' | 'personal-preview';
  readonly acceptanceId: UUID | null;
  readonly status: 'data-insufficient' | 'estimated';
  readonly validCompletedExamCount: NonNegativeSafeIntegerV1;
  readonly requiredCompletedExamCount: 2;
  readonly conservativeScoreMilliPoints: NonNegativeSafeIntegerV1 | null;
  readonly safeLostTotalMilliPoints: NonNegativeSafeIntegerV1 | null;
  readonly officialExamStructureBasisHash: Sha256HexV1;
  readonly formulaHash: Sha256HexV1;
  readonly sourceUpper: ChapterAnalyticsSourceUpperV1;
  readonly chapterProgressSnapshotHash: Sha256HexV1;
  readonly ttlPolicyVersion: 'learning-projection-snapshot-ttl.v1';
  readonly calculatedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly snapshotHash: Sha256HexV1;
}
```

```sql
public.update_profile_settings_v2(p_request jsonb) returns jsonb
public.get_chapter_readiness_v2(p_projection_snapshot_hash text) returns jsonb
```

profileの本人直接`UPDATE`はM2で撤回し、このCAS RPCだけを`authenticated`へgrantします。JWTのowner、generation、revision、timezone allowlist、settings strict schemaをshared user lock下で検証し、roleや他のprofile列を入力・更新できません。

`get_learning_projection_v2`はstrict `GetLearningProjectionRequestV2`だけを受け、JWT ownerとgenerationを検証します。published branchはacceptance ID nullかつ`effective_published_attempts`、personal-preview branchはowner本人の指定active acceptanceだけを使い、scope/acceptanceの交差、previewのpublished混入、別acceptance混入を拒否します。repeatable-read transactionの冒頭でattempt sequence/commit time、catalog revision、SRS projection revisionの四上限を固定し、その上限以下のquestion/daily projection、章1～6、同scopeの有効正式模試countを一回だけscanします。`calculatedAt`は同transactionで一度取得した`clock_timestamp()`、`ttlPolicyVersion='learning-projection-snapshot-ttl.v1'`はTTL 5分、`expiresAt=calculatedAt + interval '5 minutes'`です。DBは`calculatedAt < expiresAt`をCHECKし、client時刻を受けません。immutable `LearningProjectionSnapshotV2`とnested `ChapterProgressSnapshotV1`をappendし、outer/nestedのscope、acceptance、basis hash、formula hash、source upper、calculatedAtをexact一致させます。outer `snapshotHash`は`snapshotHash`自身だけを除き`ttlPolicyVersion/expiresAt`を含むstrict object全fieldのRFC 8785 JCS SHA-256です。

projectionはpublishedならpublishedかつverifiedの実効attemptだけ、personal-previewなら同じacceptanceのowner-preview verified attemptだけから構築し、legacy、not-graded、invalidated、suspended、`offline_unverified`を両scopeから除外します。章は1～6順exact六件、公式問数は`8,6,4,11,9,2`です。UI契約の`ChapterAnalyticsSourceUpperV1`、`ChapterProgressItemV1`、`ChapterProgressSnapshotV1`をfield名・nullability・単位までlosslessに使い、API/DB/localで別名型へ写しません。Wilsonは`z=1.959963984540`、decimal scale 12/round-half-even、lower basis pointsはfloor、安全側失点milli-pointsはceil、priority係数は`6000/2500/1500`、sample thresholdは`max(10,e_c*3)`です。sample不足章はstatus=`data-insufficient`でlower/safeLost/priorityをnullにします。

`get_chapter_readiness_v2`の入力はlowercase SHA-256 `projectionSnapshotHash`一つだけです。JWT ownerの未失効immutable snapshotをhashでexact一件解決し、attempt/catalog/SRSを再scanせず同snapshotだけから`ExamReadinessSnapshotV1`を導出します。RPCはrow lock後にDB `clock_timestamp()`を一度取得し、`clock_timestamp() < expiresAt`の場合だけ成功します。`now = expiresAt`は期限切れであり`PROJECTION_SNAPSHOT_EXPIRED`、別owner hashは存在非識別の`RESOURCE_FORBIDDEN`です。期限直前にlock・時刻検証を通ったtransactionだけ完了でき、同時/直後は拒否します。同hashの再送も毎回expiry/ownerを再検証し、期限前responseを期限後に再発行しません。scope、acceptance、basis/formula/source upper/calculatedAt、`ttlPolicyVersion`、`expiresAt`と`chapterProgressSnapshotHash`をprojectionへbyte-exactに結合します。readiness `snapshotHash`は自身だけを除くstrict response全fieldをRFC 8785 JCS化してSHA-256とし、TTL policy/expiryもpreimageへ含めます。全六章が`estimated`かつ同scopeで有効な正式模試が2回以上の場合だけstatus=`estimated`としてconservative score/safe lostを返し、それ以外は`data-insufficient`かつ両値nullです。personal-previewは同acceptance内の参考模試2回だけ、publishedは正式published模試2回だけを数え、相互混入させません。clientはprojection/readiness双方の`ttlPolicyVersion/expiresAt`を含む全fieldをlosslessにlocal保存し、履歴から再計算しません。これは学習優先度で、章別合格点や合格保証ではありません。

API `LearningProjectionSnapshotV2`はUI契約の同名outer wire型そのもので、adapter wrapperではありません。API側のbranded UUID/hash/time/safe-integerはUI runtime validatorの文字列/number制約を機械生成で狭窄した表記であり、wire key、scope literal、nested `ChapterProgressSnapshotV1`、TTL、hash preimageを変更しません。とくにUIの`dataGeneration: number`はAPI `DataGeneration`と同一のJSON numberであり、正のsafe integer `1..9007199254740991`だけを許可し、0、string化、小数、負数、2^53以上、丸め、別fieldへの写像を禁止します。UI `ExamReadinessSnapshotV1`もAPI responseと同一wire型で、projectionと同じTTL policy/expiryを持ちます。API、DB JSON、local `LocalProjectionStateV2`のschema digestを一致させ、alias field、単位変換、欠落fieldを拒否します。

### 11.1 Full bootstrap

新端末、local破損、restore後は過去eventをcurrent streamへ再発行せず、期限付きimmutable bootstrap snapshotを使用します。

```sql
public.get_current_learning_generation_v2() returns jsonb

public.begin_learning_bootstrap_v2(
  p_data_generation bigint,
  p_page_size integer default 100
) returns jsonb

public.get_learning_bootstrap_page_v2(
  p_snapshot_id uuid,
  p_section text,
  p_scope_key text,
  p_after_ordinal bigint default 0,
  p_limit integer default 100
) returns jsonb
```

```ts
type BootstrapSectionV2 =
  | 'profile'
  | 'selection-bases'
  | 'catalog'
  | 'sessions'
  | 'attempt-history'
  | 'exam-history'
  | 'session-lifecycle'
  | 'offline-reference-history'
  | 'bookmarks'
  | 'notes'
  | 'issues'
  | 'question-projection'
  | 'daily-projection';

interface BootstrapContentScopeV2 {
  readonly scopeKey: string;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly channel: ContentChannel;
  readonly previewAcceptanceId: UUID | null;
  readonly previewBundleId: string | null;
  readonly previewCanonicalHash: Sha256HexV1 | null;
  readonly previewManifestHash: Sha256HexV1 | null;
  readonly previewSelectionRevision: number | null;
  readonly catalogRevision: number;
  readonly catalogEtag: string;
  readonly projectionRevision: number;
}

interface BootstrapPartitionManifestV2 {
  readonly section: BootstrapSectionV2;
  readonly scopeKey: string;
  readonly rowCount: number;
  readonly rowsHash: Sha256HexV1;
}

interface CurrentLearningGenerationResponseV2 {
  readonly contractVersion: 2;
  readonly dataGeneration: DataGeneration;
}

interface LearningBootstrapSnapshotV2 {
  readonly contractVersion: 2;
  readonly snapshotId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly syncUpperBound: number;
  readonly serverChangeUpperBound: number;
  readonly contentScopes: readonly BootstrapContentScopeV2[];
  readonly partitions: readonly BootstrapPartitionManifestV2[];
  readonly snapshotHash: Sha256HexV1;
  readonly expiresAt: IsoUtcTimestamp;
}

interface BootstrapRowV2<T> {
  readonly ordinal: number;
  readonly value: T;
}

type BootstrapAvailableOwnedPinnedContentV2 = Exclude<
  OwnedPinnedContentDto,
  | { readonly visibility: 'suspended-tombstone' }
  | { readonly visibility: 'acceptance-revoked-tombstone' }
>;

type BootstrapSessionItemV2 = Omit<OwnedSessionItemDto, 'content'> & (
  | {
      readonly contentAvailability: 'available';
      readonly content: BootstrapAvailableOwnedPinnedContentV2;
      readonly tombstone: null;
    }
  | {
      readonly contentAvailability: 'suspended-tombstone';
      readonly content: null;
      readonly tombstone: Extract<OwnedPinnedContentDto, { readonly visibility: 'suspended-tombstone' }>;
    }
  | {
      readonly contentAvailability: 'acceptance-revoked-tombstone';
      readonly content: null;
      readonly tombstone: Extract<OwnedPinnedContentDto, { readonly visibility: 'acceptance-revoked-tombstone' }>;
    }
);

interface BootstrapOwnedLearningSessionV2
  extends Omit<OwnedLearningSessionResponseV2, 'items'> {
  readonly items: readonly BootstrapSessionItemV2[];
}

interface BootstrapSessionRecordV2 {
  readonly session: BootstrapOwnedLearningSessionV2;
  readonly canonicalRevision: NonNegativeSafeIntegerV1;
  readonly canonicalUpdatedAt: IsoUtcTimestamp;
  readonly snapshotReceivedAt: IsoUtcTimestamp;
  readonly remoteSource: LocalRemoteSourceMetadataV2;
}

interface LearningBootstrapPageBaseV2 {
  readonly contractVersion: 2;
  readonly snapshotId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly scopeKey: string;
  readonly afterOrdinal: number;
  readonly nextOrdinal: number | null;
  readonly hasMore: boolean;
  readonly pageRowsHash: Sha256HexV1;
  readonly partitionRowsHash: Sha256HexV1;
}

type LearningBootstrapPageV2 =
  | (LearningBootstrapPageBaseV2 & { readonly section: 'profile'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<PortableProfileFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'selection-bases'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<BootstrapSelectionBasisRowV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'catalog'; readonly rows: readonly BootstrapRowV2<PreAnswerQuestionDto | CatalogTombstoneDto | AcceptanceRevokedContentTombstoneV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'sessions'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<BootstrapSessionRecordV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'attempt-history'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<AttemptFactV2 | LiveAttemptCorrectionFactV2 | LiveAttemptInvalidationFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'exam-history'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<ExamTerminalFactV2 | PortableExamResultRevisionFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'session-lifecycle'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<PortableSessionLifecycleFactV2 | PortableSessionItemInvalidationFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'offline-reference-history'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<PortableOfflineExamReferenceFactV2 | PortableOfflineReferenceResultRevisionFactV2 | PortableOfflineReferenceFeedbackRevisionFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'bookmarks'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<BookmarkFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'notes'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<NoteFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'issues'; readonly scopeKey: 'global'; readonly rows: readonly BootstrapRowV2<IssueFactV2 | LiveIssueUpdateFactV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'question-projection'; readonly rows: readonly BootstrapRowV2<UserQuestionProjectionDtoV2>[] })
  | (LearningBootstrapPageBaseV2 & { readonly section: 'daily-projection'; readonly rows: readonly BootstrapRowV2<DailyActivityProjectionDtoV2>[] });
```

generation discovery RPCはactive JWTのowner本人へ現在整数だけを返し、他の本人dataを返しません。beginはそのgenerationをshared user lock下で再検証します。profile/selection-bases/session/history/bookmark/note/issueのscope keyはliteral `global`だけ、catalog/projectionはheader登録済みscope keyだけを許可します。`selection-bases/global`はsnapshot上限時点でserverに存在する本人の全basisを、未consume・consume済み・discard済みの別なくstrict `BootstrapSelectionBasisRowV2`で返します。各itemはfreeze時点で配信可能なら`contentAvailability='available'`と回答前safe content、global statusがsuspendedなら`suspended-tombstone`、personal acceptanceがrevokedなら`acceptance-revoked-tombstone`とし、両tombstone branchは`content=null`です。acceptance-revoked branchのacceptance ID、revocation ID/timeはbasisがpinしたacceptanceとappend-only revocation factにexact一致させます。`BootstrapSessionRecordV2.session.items`も同じavailable、suspended tombstone、acceptance-revoked tombstoneのstrict unionとし、両tombstone branchは`content=null`です。正答、総合解説、choice解説、feedbackは全branchで禁止します。portable exportは別の`PortableSelectionBasisFactV2`だけを使用し、bootstrap rowやsafe contentを流用しません。各sessionの`selectionBasisId`はこのpartitionのexact一件かnullへ結合し、別generation・別owner・欠損basisを拒否します。historyはselected choiceと実効結果・訂正/無効化・result revisionを含みますが、正答集合・解説を含めずfeedback RPCで後取得します。`BootstrapSessionRecordV2`はowned pre-answer sessionにcanonical revision/update time、snapshot受信時刻とstrict `LocalRemoteSourceMetadataV2`をlosslessに付与します。通常`sync-event/server-change` branchの`sourceDataGeneration`はpage/sessionのcurrent generationとexact一致します。restore直後でsource event/factを旧generation archiveからmaterializeしたrowだけは`restore-materialization` branchとし、source/target generation、source event-or-fact ID/hash、restore job、materialization link ID/hashをexact保持し、`targetDataGeneration=page.dataGeneration=session.dataGeneration`、source identity/linkはrestore archive・link行と一致させます。`canonicalRevision=session.revision`、`snapshotReceivedAt=remoteSource.receivedAt`をexact一致させ、restore branchでは`receivedAt=materializedAt`です。command sourceは`LocalRemoteSourceMetadataV2`へ偽装せず、対応する`LocalCommandReceiptV2`として別rootへ保存します。

restore sourceのv2 branchが`canonical-event`なら`sourceHash`は署名済みportable eventの`canonicalHash`、`sourceSequence`はsource generationの保存sequenceです。`portable-fact`なら`sourceHash=SHA-256(RFC 8785 JCS(strict portable fact))`、自己hash fieldを持つfactではその契約値とexact一致、`sourceSequence=null`です。legacy branchは`sourceKind='legacy-sync-event'`、`sourceDataGeneration=null`、`legacySchema='learning-sync.v1'`、元のevent ID/source sequence、`sourceLegacyFactHash=SHA-256(RFC 8785 JCS(strict PortableLegacyCanonicalEventFactV1))`だけを持ちます。legacy eventには存在しないdata generation、request hash、canonical hashを生成・代入せず、v2 source branchとのfield混在を拒否します。materialization link hashは自身だけを除くstrict linkのJCS SHA-256で、restore job、branch、source/target generation、source ID/hash、target domain IDを拘束します。DB `restore_materialization_links`のlegacy branchはsource generation null、source ID=original event ID、source hash=source legacy fact hash、source sequence=original sequenceへexact一致させます。`RestoreSessionItemInvalidationMaterializationLinkV2`の物理子row/branch列はsource/targetのfact ID/hashを変更せず、`targetSessionItemId`もfactの`sessionItemId`とexact一致させたままcurrent generationへ結合します。restore直後bootstrap、legacy/v2両branchのkill/restart、同ID異hash、link欠落、legacy canonical hash捏造、source generationをcurrentへ偽装するfixtureをgoldenにします。

beginはuser shared lockの後、selection basis/session itemが参照するpersonal acceptanceと全question versionを、acceptance UUID bytes、version UUID bytesの順にshared lockし、owner、pin、revocation、global statusを再検証してrepeatable-read stagingを作ります。page取得も同じ順でlock・再検証し、staging後に一件でもsuspendedまたはacceptance-revokedへ遷移していればrowを返さず`BOOTSTRAP_SNAPSHOT_EXPIRED`としてsnapshot全体を失効させます。新snapshotではfanoutが`pending/running/retry_wait/dead_lettered`でもglobal suspended statusまたはacceptance revocationだけでcatalog、basis、sessionの本文、choices、feedbackを0件にし、fanout完了を待ちません。clientはsuspend/revoke changeまたはこの失効を観測した時点で該当version/acceptanceのcatalog、basis/session本文、feedback cacheを一local transactionでpurgeし、新snapshotを取得します。これによりimmutable page/hashを動的変換せず、停止・取消後のpageから本文を返しません。

beginはrepeatable-read transactionで全sectionをserver stagingへ固定し、owner限定・15分期限・page上限200です。`contentScopes`は`scopeKey`のUTF-8 byte昇順です。section registry順は`profile,selection-bases,catalog,sessions,attempt-history,exam-history,session-lifecycle,offline-reference-history,bookmarks,notes,issues,question-projection,daily-projection`で固定し、`partitions`は`(section registry ordinal, scopeKey UTF-8 byte)`順、rowはordinal昇順へ固定します。ordinalは1始まり・欠番なし・重複なしです。`afterOrdinal`はexclusiveで、最初は0、responseは`ordinal > afterOrdinal`だけを返します。pageごとの`pageRowsHash=SHA-256(RFC 8785 JCS(returnedRows ordinal昇順))`、partition manifestの`rowsHash=SHA-256(RFC 8785 JCS(partition全rows ordinal昇順))`です。`snapshotHash`のpreimageは`{contractVersion:2,snapshotId,dataGeneration,syncUpperBound,serverChangeUpperBound,contentScopes,partitions,expiresAt}`で、各配列を上記順にしたRFC 8785 JCS bytesです。page hash、partition hash、件数をheaderと照合し、section/scope/ordinal差替え、期限切れ、page欠落・重複を拒否します。clientは全pageをlocal stagingへ保存し、検証後にdomain rowsとscope別cursorを一local transactionで交換します。一件でも不正なら現local stateを不変にします。完了cursorはheader上限へ固定し、その後の新規writeだけをpullします。

bootstrapのlocal格納先は固定します。`profile`→profile CAS state、`selection-bases`→safe basisとconsume/discard lifecycleを一体で持つglobal basis store、`catalog`→catalog cache、`sessions`→source/revision/time付きpre-answer session snapshot、`attempt-history`→attempt/correction/invalidation、`exam-history`→exam terminal/result revision、`session-lifecycle`→session lifecycleとsession-item invalidation fact history、`offline-reference-history`→offline reference history、`bookmarks/notes/issues`→local/remote両値を持つrevision entity、`question-projection/daily-projection`→scope別projectionです。全section・全scopeは0件でもmanifestへexact一件を含め、APIの`BootstrapSectionV2` literalをDB CHECK、PK、RPC引数、hash preimageの唯一の値集合にします。

`masteredAt`はstage 3期限後の有効正解で初めてstage 4へ到達したserver採点時刻です。stage 4/5の追加正解では保持し、誤答、breaking改訂、根拠attemptの訂正・無効化で履歴から再計算して条件を失えばnullにします。定着条件は`needsRevalidation=false AND reviewStage>=4 AND latestOutcome='correct'`です。breaking改訂では即時nullとし、新版の有効正解後にstage 0/+1日から再構築します。

提出済み模試のpin問題suspend、answer correction、attempt invalidationでは元のterminal/event/item factを更新しません。同じoperation transactionでappend-only `exam_result_revisions`へ旧新result revision、item実効結果、score、denominator、passing score、passed、result status、reasonを追記し、`effective_exam_results`を更新して`exam.result-revised` changeを発行します。`get_exam_state_v2`、履歴、feedbackは最新実効revisionだけを表示し、旧feedback cacheを同local transactionでpurgeします。分母40未満の結果は正式模試分析へ入れませんが、suspended/revokedでない各問題の有効attemptは問題学習履歴・SRSへ残し、「問題学習projection」と「正式模試result projection」を分離します。

`BootstrapSelectionBasisSourceMetadataV2`はbasis発行request/response hash・session ID・revision・server/client時刻をlosslessに保持し、`sourceSessionId=basis.sessionId`、`issuedAt=basis.issuedAt`を必須にします。consume/discard branchは対応eventまたはcommand/factのID/hash/timeとexact一致し、lifecycle branch間のfield混在を拒否します。available itemは`content.questionId/questionVersionId`とouter IDをexact一致、suspended tombstoneもtombstoneの両IDとouter IDをexact一致させます。tombstone branchにchoice order以外の本文、choices、feedback、旧contentを残しません。

### 11.2 Attempt訂正・無効化

`answer_attempts`へ無条件`UNIQUE(user_id, session_id, question_id)`を置き、無効化後も同sessionの回答枠を再利用しません。correctionは`correction_no`、`prior_correction_id`、`operation_id UNIQUE`を持ちます。attempt ID advisory lock下で`oldOutcome`が直前の実効値と一致する時だけ追記し、invalidation済みattemptへの訂正を拒否します。`corrected_at`だけで最新を決めません。

attemptは`grading_status`とnullable `is_correct`を持ちます。DB CHECKは`graded`なら`is_correct IS NOT NULL`、`not_graded_suspended|not_graded_acceptance_revoked`なら`is_correct IS NULL`を強制します。無採点attemptは同transactionでinvalidationを追記し、feedback正答、訂正、SRS、分析から除外します。offlineの未確定回答はserver attemptではなくlocal pending intentとして保存します。

```sql
private.correct_answer_attempt_v2(
  p_attempt_id uuid,
  p_old_outcome boolean,
  p_corrected_outcome boolean,
  p_reason text,
  p_operation_id uuid
) returns jsonb

private.invalidate_answer_attempt_v2(
  p_attempt_id uuid,
  p_reason text,
  p_operation_id uuid
) returns jsonb
```

両RPCは専用管理DB roleだけにgrantし、訂正/無効化、projection再構築、audit、server change feedを一transactionで確定します。同一operation ID・全入力一致だけを冪等no-opとし、異内容は拒否します。

## 12. RLS・ACL

| 対象 | authenticated | service role | 経路 |
|---|---:|---:|---|
| sync event直接SELECT | legacy互換期間のownのみ。cutover後不可 | 不可 | 旧clientはRLS、新clientはpull RPC |
| server change直接SELECT | 不可 | 不可 | pull RPC |
| sync event INSERT | legacy期間のownのみ | 不可 | canonical trigger |
| session/draft/attempt/state直接DML | 不可 | 不可 | sync RPC |
| question/version/choice/key直接SELECT | 不可 | 不可 | authenticated catalog/feedback RPC |
| note/bookmark/issue直接DML | 不可 | 不可 | sync RPC |
| attestation/final approval | reviewer本人。finalはownerだけ | 不可 | recent-auth済みauthenticated本人RPC |
| content stage/publish/suspend/retire実行 | 不可 | 不可 | `content_control`専用internal DB roleの管理RPC |

`service_role`には基礎table/view/sequenceの直接SELECT/INSERT/UPDATE/DELETE/TRUNCATEも、client/internal RPCのEXECUTEもgrantしません。client RPCは§12.1のruntime capability例外を除き`authenticated`だけへEXECUTE grantし、non-null `auth.uid()`とJWT subjectから導出したownerのDB所有一致を毎回検証し、actor/owner IDを引数から受けません。internal RPCは機能別の専用NOLOGIN role（`control_plane`、`exam_finalizer`、`content_control`、`suspension_fanout`）だけへEXECUTE grantし、claim済みjob/member、lease owner/expiry/fencing tokenまたはoperation principal snapshotを検証します。各worker LOGIN roleは必要な一つの専用NOLOGIN roleにだけ`SET ROLE`でき、transaction開始時に`SET LOCAL ROLE <dedicated_role>`してからRPCを呼びます。internal RPCで`auth.uid()`、JWT role claim、LOGIN roleのinheritanceを権限根拠にせず、PUBLIC/anon/authenticated/service_roleおよび他の専用roleから明示REVOKEします。複数専用roleへSET ROLE可能な共通super roleを共有しません。

全SECURITY DEFINER関数はRPC群ごとのneutral NOLOGIN ownerが所有し、そのownerへLOGIN、SET ROLE元membership、業務tableの汎用直接権限を与えません。SECURITY DEFINER内のSQL実効role、session由来role文字列、JWT role claimを呼出主体検証へ一切使用しません。空search path、完全修飾名、最小EXECUTE grant、入口種別に応じた上記`auth.uid()`/ownerまたはclaim/lease/fencing検証、allowlist responseを必須にします。runtime capability例外以外はPUBLIC/anon、全client/internal RPCはservice_role、各internal RPCは非対象専用roleから明示REVOKEします。ACL goldenは各基礎objectと全RPCについてPUBLIC/anon/authenticated/service_role/各専用role/neutral ownerの`has_*_privilege`を列挙し、service_role直接経路0、client RPCのcross-user拒否、internal role相互代行拒否、neutral owner credential不存在を実DBで証明します。

### 12.1 Production capability snapshot

```ts
type RuntimeFeatureV2 =
  | 'learning-sync-v2'
  | 'safe-catalog-v2'
  | 'post-answer-feedback-v2'
  | 'exam-v2'
  | 'personal-preview-v2'
  | 'content-release-v2'
  | 'question-suspension-v2'
  | 'cryptographic-release-attestation-v1'
  | 'portable-export-v2'
  | 'restore-v2'
  | 'account-delete-v2';

interface PublicRuntimeCapabilitySnapshotV2 {
  readonly contractVersion: 2;
  readonly environment: 'production';
  readonly contentOperatingMode: 'personal-only' | 'public';
  readonly publicContentReleaseEnabled: boolean;
  readonly revision: number;
  readonly mainCommit: NonEmptyTrimmedStringV1;
  readonly migrationVersions: readonly NonEmptyTrimmedStringV1[];
  readonly workerVersions: readonly {
    readonly worker: 'control-plane' | 'exam-finalizer' | 'content-control' | 'suspension-fanout';
    readonly version: NonEmptyTrimmedStringV1;
  }[];
  readonly rpcSignatureHash: Sha256HexV1;
  readonly aclEvidenceHash: Sha256HexV1;
  readonly oldClientSmokeHash: Sha256HexV1;
  readonly newClientSmokeHash: Sha256HexV1;
  readonly features: readonly { readonly feature: RuntimeFeatureV2; readonly enabled: boolean }[];
  readonly legacySyncBridgeEnabled: boolean;
  readonly restoreEnabled: boolean;
  readonly cryptographicReleaseAttestationRequired: boolean;
  readonly issuedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly signerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface RuntimeCapabilityTrustKeyV2 {
  readonly keyId: NonEmptyTrimmedStringV1;
  readonly publicKeyBase64Url: Base64Url32BytesV1;
  readonly validFrom: IsoUtcTimestamp;
  readonly validUntil: IsoUtcTimestamp;
  readonly status: 'active' | 'retiring' | 'revoked';
}

interface RuntimeCapabilityTrustBundleV2 {
  readonly schemaVersion: 'runtime-capability-trust-bundle.v2';
  readonly bundleRevision: number;
  readonly environment: 'production';
  readonly keys: NonEmptyReadonlyArray<RuntimeCapabilityTrustKeyV2>;
  readonly issuedAt: IsoUtcTimestamp;
  readonly signedByKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}
```

```sql
public.get_public_runtime_capabilities_v2() returns jsonb
```

初期production snapshotは`contentOperatingMode='personal-only'`かつ`publicContentReleaseEnabled=false`に固定します。ただしD-04未決定中は`ContentAllocationApprovalArtifactV1`が存在しないため、personal/public manifest、stage、preview activation、content-control job、対応runtime capabilityを全て0件にします。owner本人がpurpose-bound recent-authでD-04のappend-only approval artifactを確定し、definition/hashへexact結合した後だけ初期personal経路を開始できます。public manifest/job/capabilityはその時点でも0件で、将来の別rollout ADR、4自然人attestation、public review、privacy/security/device evidence、必要migration/worker/clientをproduction capabilityへ列挙し、新revisionの署名済みsnapshotで明示enableするまで作成できません。field欠落やmode/boolean、artifact/hash不一致は全content releaseをOFFへ収束させます。

この署名済みsafe RPCだけはclient RPCのauthenticated限定規則の明示例外として`anon`と`authenticated`へEXECUTEをgrantし、PUBLICと`service_role`、全internal dedicated roleからREVOKEします。IP/application単位rate limit、短時間public cache、ETagを適用し、秘密、内部URL、token、learner ID、未sanitized ACL/運用証跡を返しません。deploy verifierとpre-login clientは同じresponse bytes/signatureをbuild-pinned trust anchorで検証し、rate-limit時や検証不能時は全featureをOFFへ収束させます。

snapshotはappend-onlyで、feature registryが要求するmigration、worker、RPC署名、ACL、旧新client smokeの全条件を満たす場合だけ`enabled=true`にできます。`content-release-v2`はcontent-control worker、stage/publish/suspend/retire RPC署名、専用role ACL、release operation receipt、DB canonical/hash smokeを必須依存にします。`question-suspension-v2`はM4 target/member/receipt schema、content-control開始RPC、suspension-fanout worker version、global reject/tombstone RPC smoke、target-set完全性drillの全てを要求します。`cryptographic-release-attestation-v1`はP1 ADRが固定するcredential registration/recovery、signing envelope、key rotation/revocation、migration、client UI、literal signature goldenが全てproduction照合されるまで必ずOFFです。DB runtime control `cryptographic_release_attestation_required`の署名済みprojectionが`cryptographicReleaseAttestationRequired=true`なら、このfeatureがOFFまたは依存不全の間はpersonal/privateを含むacceptance/attestation/stage/publishをすべて拒否し、recent-authへfallbackしません。falseの時だけP0 recent-auth契約を許可し、field欠落をfalseへdefaultしません。このfeatureがOFFでもglobal suspended statusによる新規pin/write/本文/feedback拒否はDBだけで常時fail-closedとし、clientはfanout完了を仮定した表示をしません。期限切れ、未知feature、署名不正、環境/SHA不一致はclient・Pages deployともfail-closedです。`legacySyncBridgeEnabled && restoreEnabled`をDB CHECKで拒否します。秘密、内部URL、tokenは返しません。

署名対象は`signature`だけを除いたsnapshot全体のRFC 8785 JCS UTF-8 bytesです。`migrationVersions`はUTF-8 byte昇順かつ重複なし、`workerVersions`は`worker`、`features`はfeature registry順で固定します。hash fieldは`Sha256HexV1`、署名はEd25519 64 bytesのbase64url no-padding、public keyは32 bytesのbase64url no-paddingだけを受理します。signer keyが`issuedAt`時点でactiveであり、environment、main commit、revisionが一致する場合だけ有効です。literal preimage bytes、署名、public keyを持つgolden vectorをDB、client、deploy verifierの全実装へ共通入力し、expectedを実装関数で生成しません。

trust anchorはcapability RPC/DBから取得しません。初期`RuntimeCapabilityTrustBundleV2`のroot public keyとbundle digestをclient buildおよびdeploy verifierへpinします。更新bundleは現在信頼中かつ未revokedの旧keyが署名し、key ID byte昇順・重複なしで、旧新keyの有効期間を最低一release overlapさせてsnapshot使用前に先行配布します。unknown、revoked、使用時刻外、未信頼bundleのkeyは当該featureをOFFにします。DB key rowは検査材料であって単独trust anchorではありません。root rotationは別ADR・二人承認・旧root署名済みtransition artifactを要求します。key差替え、未知key、rotation前使用、overlap欠落、revoked keyをclient/deploy共通goldenとE2Eで拒否します。

## 13. Content acceptance・attestation RPC

P0はSupabase recent-authによる認証済みattestationだけに固定します。暗号署名・否認防止とは呼ばず、WebAuthn、端末鍵、自然人署名はcredential lifecycleを含む別ADR/P1とします。owner/法務が暗号学的attestationを必須化した場合、production capabilityの`cryptographic-release-attestation-v1`がADR記載のmigration/worker/client/goldenを満たすまで、personal/private releaseを含む新規acceptance/attestation/publishをfail-closedで拒否し、recent-authへfallbackしません。

```ts
interface ContentCanonicalQuestionVersionBaseV2 {
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly versionNumber: PositiveSafeIntegerV1;
  readonly certificationCode: string;
  readonly syllabusVersion: string;
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly learningObjectiveCode: LearningObjectiveCodeV1;
  readonly learningObjectiveTitle: string;
  readonly kLevel: 1 | 2 | 3;
  readonly cognitiveOperation: CognitiveOperationV1;
  readonly patternFamilyId: `${LearningObjectiveCodeV1}:pf${PatternFamilyOrdinalV1}`;
  readonly questionForm: QuestionFormV1;
  readonly difficulty: 1 | 2 | 3;
  readonly examEligibility: 'eligible' | 'practice-only';
  readonly shuffleChoices: boolean;
  readonly prompt: string;
  readonly scenarioFacts: readonly {
    readonly factKey: string;
    readonly kind: ScenarioFactKindV1;
    readonly statement: string;
    readonly answerRelevance: 'required' | 'context';
  }[];
  readonly scenarioArtifacts: readonly {
    readonly artifactKey: string;
    readonly kind: ScenarioArtifactKindV1;
    readonly body: string;
    readonly answerRelevance: 'required' | 'context';
  }[];
  readonly premises: readonly {
    readonly premiseKey: string;
    readonly statement: string;
    readonly sourceFactKeys: readonly string[];
    readonly sourceArtifactKeys: readonly string[];
  }[];
  readonly askedClaims: readonly {
    readonly claimKey: string;
    readonly premiseKeys: readonly string[];
    readonly cognitiveOperation: CognitiveOperationV1;
    readonly requestedJudgement: string;
  }[];
  readonly reasoningSteps: readonly {
    readonly stepNumber: number;
    readonly inputFactKeys: readonly string[];
    readonly inputArtifactKeys: readonly string[];
    readonly premiseKeys: readonly string[];
    readonly conclusionClaimKey: string;
    readonly explanation: string;
  }[];
  readonly choices: readonly {
    readonly choiceStableId: string;
    readonly label: string;
    readonly body: string;
    readonly claim: string;
    readonly sortOrder: number;
    readonly relevantPremiseKeys: readonly string[];
    readonly relevantClaimKeys: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
    readonly addressedPremiseKeys: readonly string[];
    readonly addressedClaimKeys: readonly string[];
    readonly misconceptionCode: string | null;
    readonly errorType: ChoiceErrorTypeV1;
    readonly explanation: string;
  }[];
  readonly correctChoiceStableIds: readonly string[];
  readonly questionExplanation: string;
  readonly takeaway: string;
  readonly commonTrap: string;
  readonly sourceReference: string;
  readonly compatibility: 'compatible' | 'breaking' | 'cosmetic';
  readonly distributionScope: 'release_candidate';
}

type ContentCanonicalQuestionVersionV2 = ContentCanonicalQuestionVersionBaseV2 & (
  | { readonly selectionType: 'single'; readonly requiredChoiceCount: 1 }
  | { readonly selectionType: 'multiple'; readonly requiredChoiceCount: 2 }
);

interface ContentCanonicalReleaseV2 {
  readonly canonicalSchemaVersion: 'content-canonical-release.v2';
  readonly allocationVersion: 1;
  readonly blueprintSchemaVersion: 'lo-question-blueprint.v1';
  readonly blueprintHash: Sha256HexV1;
  readonly questions: NonEmptyReadonlyArray<ContentCanonicalQuestionVersionV2>;
}

interface ReleaseHashSetV2 {
  readonly releaseSchemaVersion: 2;
  readonly manifestStage: 'personal_preview' | 'public_release';
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly allocationVersion: 1;
  readonly rawHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly manifestHash: Sha256HexV1;
}

type OfficialSourceClaimCodeV1 =
  | 'syllabus-version-jstqb-fl-2023v4.0.j02'
  | 'exam-question-count-40'
  | 'exam-duration-minutes-60'
  | 'passing-score-26-of-40'
  | 'chapter-question-counts-8-6-4-11-9-2'
  | 'k-level-question-counts-8-24-8';

interface OfficialSourceVerificationEvidenceV1 {
  readonly schemaVersion: 'official-source-verification-evidence.v1';
  readonly evidenceId: UuidV1;
  readonly sourceId: OfficialSourceIdV1;
  readonly sourceUrl: OfficialSourceUrlV1;
  readonly exactVersion: NonEmptyTrimmedStringV1;
  readonly retrievedAt: IsoUtcTimestampV1;
  readonly downloadedBytesSha256: Sha256HexV1;
  readonly verificationResult: 'verified';
  readonly runnerId: NonEmptyTrimmedStringV1;
  readonly runnerVersion: NonEmptyTrimmedStringV1;
  readonly artifactHash: Sha256HexV1;
}

interface OfficialSourceRequirementRegistryV1 {
  readonly schemaVersion: 'official-source-requirement-registry.v1';
  readonly sources: readonly [
    {
      readonly sourceId: 'jstqb-foundation-syllabus-2023v4.0.j02';
      readonly sourceUrl: 'https://www.jstqb.jp/syllabus/';
      readonly requiredClaimCodes: readonly ['syllabus-version-jstqb-fl-2023v4.0.j02'];
    },
    {
      readonly sourceId: 'jstqb-foundation-guidance';
      readonly sourceUrl: 'https://www.jstqb.jp/guidance/';
      readonly requiredClaimCodes: readonly ['exam-question-count-40', 'exam-duration-minutes-60'];
    },
    {
      readonly sourceId: 'istqb-exam-structure-tables-v1.18';
      readonly sourceUrl: 'https://istqb.org/wp-content/uploads/2026/05/ISTQB_Exam-Structure-Tables_v1.18.pdf';
      readonly requiredClaimCodes: readonly [
        'exam-question-count-40',
        'exam-duration-minutes-60',
        'passing-score-26-of-40',
        'chapter-question-counts-8-6-4-11-9-2',
        'k-level-question-counts-8-24-8'
      ];
    }
  ];
  readonly officialSourceRequirementRegistryHash: Sha256HexV1;
}

interface OfficialSourceVerificationReferenceV1<TSourceId extends OfficialSourceIdV1> {
  readonly sourceId: TSourceId;
  readonly evidenceId: UuidV1;
  readonly artifactHash: Sha256HexV1;
  readonly exactVersion: NonEmptyTrimmedStringV1;
  readonly retrievedAt: IsoUtcTimestampV1;
  readonly downloadedBytesSha256: Sha256HexV1;
}

interface OfficialSourceVerificationCoverageV1 {
  readonly schemaVersion: 'official-source-verification-coverage.v1';
  readonly officialSourceRequirementRegistryHash: Sha256HexV1;
  readonly requiredSourceIds: readonly [
    'jstqb-foundation-syllabus-2023v4.0.j02',
    'jstqb-foundation-guidance',
    'istqb-exam-structure-tables-v1.18'
  ];
  readonly requiredClaimCodes: readonly [
    'syllabus-version-jstqb-fl-2023v4.0.j02',
    'exam-question-count-40',
    'exam-duration-minutes-60',
    'passing-score-26-of-40',
    'chapter-question-counts-8-6-4-11-9-2',
    'k-level-question-counts-8-24-8'
  ];
  readonly evidenceRefs: readonly [
    OfficialSourceVerificationReferenceV1<'jstqb-foundation-syllabus-2023v4.0.j02'>,
    OfficialSourceVerificationReferenceV1<'jstqb-foundation-guidance'>,
    OfficialSourceVerificationReferenceV1<'istqb-exam-structure-tables-v1.18'>
  ];
  readonly officialSourceVerificationCoverageHash: Sha256HexV1;
}

interface ContentOfficialExamStructureBasisV1 {
  readonly schemaVersion: 'content-official-exam-structure-basis.v1';
  readonly certificationCode: 'CTFL';
  readonly syllabusVersion: 'JSTQB-FL-2023V4.0.J02';
  readonly sourceDocumentTitle: 'ISTQB Exam Structure Tables';
  readonly sourceDocumentVersion: 'v1.18';
  readonly sourceDocumentHash: Sha256HexV1;
  readonly sourceReviewedAt: IsoUtcTimestamp;
  readonly sourceVerificationEvidenceId: UuidV1;
  readonly sourceVerificationEvidenceHash: Sha256HexV1;
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
  readonly kLevelCounts: {
    readonly k1: 100;
    readonly k2: 300;
    readonly k3: 100;
  };
  readonly singleChoiceCount: 440;
  readonly multipleChoiceCount: 60;
  readonly multipleChoiceChapterCounts: readonly [12, 9, 6, 17, 13, 3];
  readonly multipleChoiceKLevelCounts: readonly [6, 39, 15];
  readonly multipleRequiredChoiceCount: 2;
  readonly learningObjectiveCounts: LearningObjectiveCountsV1;
}

type ContentExpansionTriggerV1 =
  | { readonly trigger: 'replacement-capacity'; readonly unavailableCurrentCount: PositiveSafeIntegerV1; readonly thresholdCount: 100 }
  | { readonly trigger: 'syllabus-change'; readonly syllabusChangeArtifactHash: Sha256HexV1 }
  | {
      readonly trigger: 'learning-saturation';
      readonly observationDays: PositiveSafeIntegerV1;
      readonly learningObjectiveCode: LearningObjectiveCodeV1;
      readonly effectiveAttemptCount: PositiveSafeIntegerV1;
      readonly firstSeenAccuracyBasisPoints: NonNegativeSafeIntegerV1;
      readonly unresolvedRateBasisPoints: NonNegativeSafeIntegerV1;
    };

interface ContentExpansionAssessmentV1 {
  readonly schemaVersion: 'content-expansion-assessment.v1';
  readonly currentAllocationVersion: 1;
  readonly currentQuestionCount: 500;
  readonly proposedQuestionCount: 600;
  readonly triggers: NonEmptyReadonlyArray<ContentExpansionTriggerV1>;
  readonly assessedAt: IsoUtcTimestamp;
  readonly ownerApprovalArtifactHash: Sha256HexV1;
  readonly assessmentHash: Sha256HexV1;
}

interface ContentAllocationApprovalArtifactV1 {
  readonly schemaVersion: 'content-allocation-approval-artifact.v1';
  readonly allocationHash: Sha256HexV1;
  readonly decision: 'owner_approved';
  readonly approvedBy: UUID;
  readonly approvedAt: IsoUtcTimestamp;
  readonly ownerDecisionReference: 'D-04';
  readonly sourceDesignDocumentHash: Sha256HexV1;
}

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
type LearningObjectiveCountsV1 = {
  readonly [K in LearningObjectiveCodeV1]: PositiveSafeIntegerV1;
};

interface ContentVersionRefV1 {
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
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

type ContentReviewTypeV2 =
  | 'machine-gate'
  | 'blind-solve'
  | 'personal-human'
  | 'technical'
  | 'editorial'
  | 'mobile-web-preview';

type ContentReviewSubjectV2 =
  | { readonly type: 'human'; readonly principalId: UUID }
  | { readonly type: 'system-run'; readonly runnerId: NonEmptyTrimmedStringV1; readonly runnerDigest: Sha256HexV1; readonly runId: NonEmptyTrimmedStringV1 }
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
  readonly reviewedAt: IsoUtcTimestamp;
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
      readonly submittedAt: IsoUtcTimestamp;
      readonly answerKeyDisclosedAt: IsoUtcTimestamp;
      readonly correctSetMatched: true;
    })
  | (ContentReviewArtifactBaseV2 & {
      readonly reviewType: 'personal-human' | 'technical' | 'editorial' | 'mobile-web-preview';
      readonly subject: Extract<ContentReviewSubjectV2, { readonly type: 'human' }>;
      readonly checklistVersion: NonEmptyTrimmedStringV1;
      readonly checklistResultArtifactHash: Sha256HexV1;
    });

type HumanContentReviewArtifactV2<
  K extends 'personal-human' | 'technical' | 'editorial' | 'mobile-web-preview',
> = ContentReviewArtifactBaseV2 & {
  readonly reviewType: K;
  readonly subject: Extract<ContentReviewSubjectV2, { readonly type: 'human' }>;
  readonly checklistVersion: NonEmptyTrimmedStringV1;
  readonly checklistResultArtifactHash: Sha256HexV1;
};

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
  readonly issueRefs: readonly (ContentVersionRefV1 & { readonly issueId: UUID })[];
  readonly reviewCoverageHash: Sha256HexV1;
}

type ContentAiReviewPassIdV1 =
  | 'g0-schema-canonical' | 'g1-question-validity' | 'g2-blind-solve'
  | 'g3-answer-evidence' | 'g4-multiple-bijection' | 'g5-distractor-ambiguity'
  | 'g6-cue-japanese' | 'g7-lo-k-difficulty' | 'g8-numeric-oracle'
  | 'g9-duplicate-similarity' | 'g10-copyright-provenance'
  | 'g11-ui-a11y-render' | 'g12-adjudication';

type ContentAiReviewOutcomeV1 =
  | { readonly result: 'pass'; readonly notApplicableReason: null }
  | { readonly result: 'not-applicable'; readonly notApplicableReason: 'not-multiple-selection' | 'no-numeric-claim' };

interface ContentGenerationArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-generation-artifact.v1';
  readonly generatedSubjectHash: Sha256HexV1;
  readonly generationPolicyVersion: NonEmptyTrimmedStringV1;
  readonly generationInputPacketHash: Sha256HexV1;
  readonly generator: Extract<ContentReviewSubjectV2, { readonly type: 'model-run' }>;
  readonly generatedAt: IsoUtcTimestamp;
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
  readonly evaluatedAt: IsoUtcTimestamp;
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
  readonly submittedAt: IsoUtcTimestamp;
  readonly answerKeyDisclosedAt: IsoUtcTimestamp;
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
  readonly adjudicatedAt: IsoUtcTimestamp;
  readonly artifactHash: Sha256HexV1;
}

type ContentAiReviewArtifactV1 =
  | ContentAiEvaluationArtifactV1
  | ContentAiBlindSolveArtifactV1
  | ContentAiAdjudicationArtifactV1;

interface ContentAiReviewCoverageV1 {
  readonly schemaVersion: 'content-ai-review-coverage.v1';
  readonly expectedQuestionCount: 500;
  readonly expectedGenerationArtifactCount: 500;
  readonly expectedPassCountPerQuestion: 13;
  readonly expectedReviewArtifactCount: 6500;
  readonly expectedQuestionRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly generationArtifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & { readonly artifactHash: Sha256HexV1 }>;
  readonly requiredPassRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & { readonly passId: ContentAiReviewPassIdV1 }>;
  readonly reviewArtifactRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & { readonly passId: ContentAiReviewPassIdV1; readonly artifactHash: Sha256HexV1 }>;
  readonly staleArtifactRefs: readonly (ContentVersionRefV1 & { readonly passId: ContentAiReviewPassIdV1; readonly artifactHash: Sha256HexV1 })[];
  readonly unresolvedIssueRefs: readonly (ContentVersionRefV1 & { readonly issueId: UUID })[];
  readonly aiReviewCoverageHash: Sha256HexV1;
}

type ContentOwnerPersonalReviewDecisionV1 =
  | { readonly decision: 'pass'; readonly changesRequiredIssueId: null }
  | { readonly decision: 'changes_required'; readonly changesRequiredIssueId: UUID };

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
  readonly blindSubmittedAt: IsoUtcTimestamp;
  readonly answerKeyDisclosedAt: IsoUtcTimestamp;
  readonly revealStateTransitions: readonly ['blind', 'revealed', 'hidden', 'audit-completed'];
  readonly revealedAuditArtifactHash: Sha256HexV1;
  readonly checklistVersion: NonEmptyTrimmedStringV1;
  readonly checklistResultArtifactHash: Sha256HexV1;
  readonly outcome: ContentOwnerPersonalReviewDecisionV1;
  readonly reviewedAt: IsoUtcTimestamp;
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
  readonly changesRequiredIssueRefs: readonly (ContentVersionRefV1 & { readonly issueId: UUID })[];
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

interface PersonalHumanReviewSamplingArtifactV1 {
  readonly schemaVersion: 'personal-human-review-sampling-artifact.v1';
  readonly samplingId: UUID;
  readonly samplingFreezeHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly blueprintHash: Sha256HexV1;
  readonly allocationHash: Sha256HexV1;
  readonly qualityGateConfigHash: Sha256HexV1;
  readonly seedBase64Url: Base64Url32BytesV1;
  readonly issuedAt: IsoUtcTimestamp;
  readonly issuerServiceId: NonEmptyTrimmedStringV1;
  readonly issuerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly samplingRulesVersion: 'personal-human-review-sampling.v1';
  readonly strata: NonEmptyReadonlyArray<{
    readonly chapterNumber: 1 | 2 | 3 | 4 | 5 | 6;
    readonly kLevel: 1 | 2;
    readonly selectionType: 'single' | 'multiple';
    readonly populationCount: PositiveSafeIntegerV1;
    readonly quota: PositiveSafeIntegerV1;
    readonly populationHash: Sha256HexV1;
    readonly memberRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
      readonly rankHash: Sha256HexV1;
      readonly selectedByStratumSample: boolean;
    }>;
    readonly cutoffRankHash: Sha256HexV1;
  }>;
  readonly mandatorySelectedRefs: NonEmptyReadonlyArray<ContentVersionRefV1 & {
    readonly selectionReasons: NonEmptyReadonlyArray<
      'k3-all' | 'multiple-all' | 'blind-disagreement-all' | 'carry-forward'
    >;
  }>;
  readonly finalSelectedRefs: NonEmptyReadonlyArray<ContentVersionRefV1>;
  readonly signature: Base64Url64BytesV1;
}

interface ContentProvenanceV2 {
  readonly schemaVersion: 'content-provenance.v2';
  readonly origin: 'independent-original';
  readonly authoredAt: IsoUtcTimestamp;
  readonly normativeSources: NonEmptyReadonlyArray<{
    readonly sourceId: 'ISTQB-CTFL-4.0.1' | 'JSTQB-FL-2023V4.0.J02';
    readonly chapterCode: string;
    readonly sectionCode: string;
    readonly learningObjectiveCode: LearningObjectiveCodeV1;
  }>;
  readonly externalProblemSources: readonly [];
  readonly officialSampleProblemUsed: false;
  readonly oldRejectedBundleUsed: false;
  readonly accountableHuman: {
    readonly principalId: UUID;
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

interface ContentAccountabilityReviewArtifactV1 {
  readonly schemaVersion: 'content-accountability-review-artifact.v1';
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly subjectHash: Sha256HexV1;
  readonly principalId: UUID;
  readonly identityAssertion: {
    readonly method: 'recent-authenticated-human';
    readonly assertionId: UUID;
    readonly assertionArtifactHash: Sha256HexV1;
    readonly assertedPrincipalId: UUID;
    readonly assertedAt: IsoUtcTimestamp;
  };
  readonly reviewedAt: IsoUtcTimestamp;
  readonly result: 'pass';
  readonly statementVersion: 'content-accountability-statement.v1';
  readonly statementHash: Sha256HexV1;
}

interface ContentIdentityAssertionArtifactV1 {
  readonly schemaVersion: 'content-identity-assertion-artifact.v1';
  readonly assertionId: UUID;
  readonly subjectPrincipalId: UUID;
  readonly actorKind: 'human';
  readonly purpose: 'content-accountability-review';
  readonly audience: 'jstqb-content-release-v2';
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly subjectHash: Sha256HexV1;
  readonly statementVersion: 'content-accountability-statement.v1';
  readonly statementHash: Sha256HexV1;
  readonly authMethod: 'recent-auth';
  readonly authenticatedAt: IsoUtcTimestamp;
  readonly issuedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly issuer: NonEmptyTrimmedStringV1;
  readonly keyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly nonce: Base64Url32BytesV1;
  readonly signature: Base64Url64BytesV1;
}

interface ContentCopyrightCorpusRegistryV1 {
  readonly schemaVersion: 'content-copyright-corpus-registry.v1';
  readonly registryId: NonEmptyTrimmedStringV1;
  readonly asOf: IsoUtcTimestamp;
  readonly entries: NonEmptyReadonlyArray<{
    readonly corpusId: NonEmptyTrimmedStringV1;
    readonly corpusDigest: Sha256HexV1;
    readonly scope: NonEmptyTrimmedStringV1;
    readonly licenseReviewArtifactHash: Sha256HexV1;
  }>;
  readonly registryDigest: Sha256HexV1;
}

interface ContentProvenanceManifestEntryV2 extends ContentVersionRefV1 {
  readonly provenance: ContentProvenanceV2;
}

interface ContentProvenanceCanonicalArtifactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'content-provenance-canonical-artifact.v1';
  readonly provenance: ContentProvenanceV2;
  readonly provenanceCanonicalHash: Sha256HexV1;
}

// 以下は content-blueprint-v1.md §3.2.1 の生成表示であり、本書で独立改訂しない。
type CanonicalDecimalV1 = string;
type CanonicalRationalV1 = string;
type OracleInputValueV1 =
  | { readonly kind: 'scalar'; readonly value: CanonicalDecimalV1 }
  | { readonly kind: 'rational'; readonly value: CanonicalRationalV1 }
  | { readonly kind: 'rational-list'; readonly values: NonEmptyReadonlyArray<CanonicalRationalV1> };
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
type NumericExpectedV1 =
  | { readonly kind: 'scalar'; readonly exactValue: CanonicalRationalV1; readonly displayedValue: CanonicalDecimalV1 }
  | {
      readonly kind: 'ordered-set';
      readonly exactValues: NonEmptyReadonlyArray<CanonicalRationalV1>;
      readonly displayedValues: NonEmptyReadonlyArray<CanonicalDecimalV1>;
    };

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
  readonly verifiedAt: IsoUtcTimestamp;
  readonly numericOracleVerificationArtifactHash: Sha256HexV1;
}

interface ContentReleaseCoverageHashesV1 {
  readonly reviewCoverageHash: Sha256HexV1;
  readonly identityAssertionCoverageHash: Sha256HexV1;
  readonly accountabilityCoverageHash: Sha256HexV1;
  readonly provenanceCoverageHash: Sha256HexV1;
}

interface PersonalPreviewReleaseManifestV2 extends ContentReleaseCoverageHashesV1 {
  readonly releaseManifestSchemaVersion: 2;
  readonly stage: 'personal_preview';
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly rawHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly blueprintSchemaVersion: 'lo-question-blueprint.v1';
  readonly allocation: ContentAllocationDefinitionV1;
  readonly allocationHash: Sha256HexV1;
  readonly allocationApproval: ContentAllocationApprovalArtifactV1;
  readonly allocationApprovalArtifactHash: Sha256HexV1;
  readonly officialSourceVerificationCoverageHash: Sha256HexV1;
  readonly loBlueprintHash: Sha256HexV1;
  readonly qualityGateConfig: ContentQualityGateConfigV1;
  readonly qualityGateConfigHash: Sha256HexV1;
  readonly copyrightCorpusRegistry: ContentCopyrightCorpusRegistryV1;
  readonly copyrightCorpusRegistryHash: Sha256HexV1;
  readonly personalHumanReviewSampling: PersonalHumanReviewSamplingArtifactV1;
  readonly personalHumanReviewSamplingArtifactHash: Sha256HexV1;
  readonly numericOracleVerificationArtifactHash: Sha256HexV1;
  readonly reviewCoverage: ContentReviewCoverageV2;
  readonly ownerPersonalReviewCoverage: ContentOwnerPersonalReviewCoverageV1;
  readonly aiReviewCoverage: ContentAiReviewCoverageV1;
  readonly aiReviewCoverageHash: Sha256HexV1;
  readonly generationArtifacts: NonEmptyReadonlyArray<ContentGenerationArtifactV1>;
  readonly aiEvaluationArtifacts: NonEmptyReadonlyArray<ContentAiEvaluationArtifactV1>;
  readonly aiBlindSolveArtifacts: NonEmptyReadonlyArray<ContentAiBlindSolveArtifactV1>;
  readonly aiAdjudicationArtifacts: NonEmptyReadonlyArray<ContentAiAdjudicationArtifactV1>;
  readonly ownerPersonalReviews: NonEmptyReadonlyArray<ContentOwnerPersonalReviewArtifactV1 & {
    readonly outcome: { readonly decision: 'pass'; readonly changesRequiredIssueId: null };
  }>;
  readonly identityAssertionCoverage: ContentIdentityAssertionCoverageV1;
  readonly accountabilityCoverage: ContentAccountabilityCoverageV1;
  readonly provenanceCoverage: ContentProvenanceCoverageV1;
  readonly machineAndBlindReviews: NonEmptyReadonlyArray<Extract<ContentReviewArtifactV2, { readonly reviewType: 'machine-gate' | 'blind-solve' }>>;
  readonly personalHumanReviews: NonEmptyReadonlyArray<HumanContentReviewArtifactV2<'personal-human'>>;
  readonly accountabilityReviews: NonEmptyReadonlyArray<ContentAccountabilityReviewArtifactV1>;
  readonly identityAssertions: NonEmptyReadonlyArray<ContentIdentityAssertionArtifactV1>;
  readonly provenance: NonEmptyReadonlyArray<ContentProvenanceManifestEntryV2>;
  readonly unresolvedIssueCount: 0;
  readonly sourceCommit: NonEmptyTrimmedStringV1;
}

interface PublicReleaseManifestV2 extends ContentReleaseCoverageHashesV1 {
  readonly releaseManifestSchemaVersion: 2;
  readonly stage: 'public_release';
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly rawHash: Sha256HexV1;
  readonly canonicalHash: Sha256HexV1;
  readonly blueprintSchemaVersion: 'lo-question-blueprint.v1';
  readonly parentPersonalManifestHash: Sha256HexV1;
  readonly allocationHash: Sha256HexV1;
  readonly allocationApprovalArtifactHash: Sha256HexV1;
  readonly officialSourceVerificationCoverageHash: Sha256HexV1;
  readonly loBlueprintHash: Sha256HexV1;
  readonly qualityGateConfigHash: Sha256HexV1;
  readonly copyrightCorpusRegistryHash: Sha256HexV1;
  readonly personalHumanReviewSamplingArtifactHash: Sha256HexV1;
  readonly numericOracleVerificationArtifactHash: Sha256HexV1;
  readonly reviewCoverage: ContentReviewCoverageV2;
  readonly identityAssertionCoverage: ContentIdentityAssertionCoverageV1;
  readonly accountabilityCoverage: ContentAccountabilityCoverageV1;
  readonly provenanceCoverage: ContentProvenanceCoverageV1;
  readonly previewReviews: NonEmptyReadonlyArray<HumanContentReviewArtifactV2<'mobile-web-preview'>>;
  readonly technicalReviews: NonEmptyReadonlyArray<HumanContentReviewArtifactV2<'technical'>>;
  readonly editorialReviews: NonEmptyReadonlyArray<HumanContentReviewArtifactV2<'editorial'>>;
  readonly unresolvedIssueCount: 0;
  readonly sourceCommit: NonEmptyTrimmedStringV1;
}

type ContentReleaseManifestV2 =
  | PersonalPreviewReleaseManifestV2
  | PublicReleaseManifestV2;

interface BeginOwnerQuestionReviewSessionRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly canonicalHash: Sha256HexV1;
}

interface BeginOwnerQuestionReviewSessionResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly reviewSessionId: UUID;
  readonly expiresAt: IsoUtcTimestamp;
  readonly csrfToken: Base64Url32BytesV1;
}

interface GetOwnerQuestionReviewRequestV2 {
  readonly contractVersion: 2;
  readonly reviewSessionId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly canonicalHash: Sha256HexV1;
  readonly afterRef: ContentVersionRefV1 | null;
}

type OwnerQuestionReviewRuntimeStateV2 =
  | 'blind'
  | 'blind_submitted'
  | 'revealed'
  | 'hidden'
  | 'audit_completed';

interface OwnerQuestionReviewInitialPacketV1 extends ContentVersionRefV1 {
  readonly canonicalHash: Sha256HexV1;
  readonly reviewRevision: NonNegativeSafeIntegerV1;
  readonly state: OwnerQuestionReviewRuntimeStateV2;
  readonly lastTransitionFactHash: Sha256HexV1 | null;
  readonly question: PreAnswerQuestionDto;
  readonly generationArtifactHash: Sha256HexV1;
  readonly aiReviewCoverageHash: Sha256HexV1;
  readonly priorOwnerReview: ContentOwnerPersonalReviewArtifactV1 | null;
}

interface SubmitOwnerQuestionBlindAnswerRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly questionRef: ContentVersionRefV1;
  readonly expectedReviewRevision: NonNegativeSafeIntegerV1;
  readonly blindPacketHash: Sha256HexV1;
  readonly submittedChoiceStableIds: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
  readonly blindRationale: NonEmptyTrimmedStringV1;
  readonly blindRationaleArtifactHash: Sha256HexV1;
}

interface RevealOwnerQuestionReviewRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly questionRef: ContentVersionRefV1;
  readonly expectedReviewRevision: PositiveSafeIntegerV1;
  readonly expectedBlindSubmissionFactHash: Sha256HexV1;
}

interface OwnerQuestionReviewRevealedPacketV1 extends ContentVersionRefV1 {
  readonly reviewRevision: PositiveSafeIntegerV1;
  readonly question: ContentCanonicalQuestionVersionV2;
  readonly generationArtifact: ContentGenerationArtifactV1;
  readonly aiReviewArtifacts: readonly [
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g0-schema-canonical' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g1-question-validity' },
    ContentAiBlindSolveArtifactV1,
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g3-answer-evidence' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g4-multiple-bijection' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g5-distractor-ambiguity' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g6-cue-japanese' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g7-lo-k-difficulty' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g8-numeric-oracle' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g9-duplicate-similarity' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g10-copyright-provenance' },
    ContentAiEvaluationArtifactV1 & { readonly passId: 'g11-ui-a11y-render' },
    ContentAiAdjudicationArtifactV1
  ];
}

interface HideOwnerQuestionReviewRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly questionRef: ContentVersionRefV1;
  readonly expectedReviewRevision: PositiveSafeIntegerV1;
  readonly expectedRevealFactHash: Sha256HexV1;
}

interface CompleteOwnerQuestionReviewAuditRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly questionRef: ContentVersionRefV1;
  readonly expectedReviewRevision: PositiveSafeIntegerV1;
  readonly expectedHideFactHash: Sha256HexV1;
  readonly revealedAuditArtifactHash: Sha256HexV1;
  readonly checklistVersion: NonEmptyTrimmedStringV1;
  readonly checklistResultArtifactHash: Sha256HexV1;
}

interface OwnerQuestionDisclosureAuditFactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'owner-question-disclosure-audit-fact.v1';
  readonly auditFactId: UUID;
  readonly priorAuditFactId: UUID | null;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly action: 'blind-submit' | 'reveal' | 'hide' | 'audit-complete';
  readonly priorState: 'blind' | 'blind_submitted' | 'revealed' | 'hidden';
  readonly state: 'blind_submitted' | 'revealed' | 'hidden' | 'audit_completed';
  readonly priorReviewRevision: NonNegativeSafeIntegerV1;
  readonly reviewRevision: PositiveSafeIntegerV1;
  readonly occurredAt: IsoUtcTimestamp;
  readonly factHash: Sha256HexV1;
}

interface OwnerReviewTransitionResponseBaseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly transitionReceiptId: UUID;
  readonly operationResponseHash: Sha256HexV1;
}

type OwnerQuestionDisclosureResponseV2 = OwnerReviewTransitionResponseBaseV2 & (
  | {
      readonly state: 'blind_submitted';
      readonly reviewRevision: PositiveSafeIntegerV1;
      readonly lastTransitionFactHash: Sha256HexV1;
      readonly packet: null;
      readonly auditFact: OwnerQuestionDisclosureAuditFactV1 & { readonly action: 'blind-submit'; readonly state: 'blind_submitted' };
    }
  | {
      readonly state: 'revealed';
      readonly reviewRevision: PositiveSafeIntegerV1;
      readonly lastTransitionFactHash: Sha256HexV1;
      readonly packet: OwnerQuestionReviewRevealedPacketV1;
      readonly auditFact: OwnerQuestionDisclosureAuditFactV1 & { readonly action: 'reveal'; readonly state: 'revealed' };
    }
  | {
      readonly state: 'hidden';
      readonly reviewRevision: PositiveSafeIntegerV1;
      readonly lastTransitionFactHash: Sha256HexV1;
      readonly packet: null;
      readonly auditFact: OwnerQuestionDisclosureAuditFactV1 & { readonly action: 'hide'; readonly state: 'hidden' };
    }
  | {
      readonly state: 'audit_completed';
      readonly reviewRevision: PositiveSafeIntegerV1;
      readonly lastTransitionFactHash: Sha256HexV1;
      readonly packet: null;
      readonly auditFact: OwnerQuestionDisclosureAuditFactV1 & { readonly action: 'audit-complete'; readonly state: 'audit_completed' };
    }
);

interface GetOwnerQuestionReviewResponseBaseV2 {
  readonly contractVersion: 2;
  readonly reviewSessionId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly canonicalHash: Sha256HexV1;
  readonly totalCount: 500;
  readonly reviewedCount: NonNegativeSafeIntegerV1;
  readonly passedCount: NonNegativeSafeIntegerV1;
  readonly changesRequiredCount: NonNegativeSafeIntegerV1;
}

type GetOwnerQuestionReviewResponseV2 = GetOwnerQuestionReviewResponseBaseV2 & (
  | {
      readonly complete: false;
      readonly state: OwnerQuestionReviewRuntimeStateV2;
      readonly reviewRevision: NonNegativeSafeIntegerV1;
      readonly lastTransitionFactHash: Sha256HexV1 | null;
      readonly packet: OwnerQuestionReviewInitialPacketV1;
    }
  | {
      readonly complete: true;
      readonly state: null;
      readonly reviewRevision: null;
      readonly lastTransitionFactHash: null;
      readonly packet: null;
    }
);

type RecordOwnerQuestionReviewRequestV2 = {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly bundleId: NonEmptyTrimmedStringV1;
  readonly canonicalHash: Sha256HexV1;
  readonly questionStableId: NonEmptyTrimmedStringV1;
  readonly versionStableKey: NonEmptyTrimmedStringV1;
  readonly expectedReviewRevision: PositiveSafeIntegerV1;
  readonly expectedAuditCompleteFactHash: Sha256HexV1;
  readonly reviewedCanonicalHash: Sha256HexV1;
  readonly reviewedBlueprintHash: Sha256HexV1;
  readonly reviewedAllocationHash: Sha256HexV1;
  readonly reviewedQualityGateConfigHash: Sha256HexV1;
  readonly reviewPolicyVersion: NonEmptyTrimmedStringV1;
  readonly expectedPriorReviewArtifactHash: Sha256HexV1 | null;
} & (
  | {
      readonly decision: 'pass';
      readonly issue: null;
    }
  | {
      readonly decision: 'changes_required';
      readonly issue: {
        readonly category: ContentIssueCategory;
        readonly reason: NonEmptyTrimmedStringV1;
      };
    }
);

interface OwnerReviewDecisionAuditFactV1 extends ContentVersionRefV1 {
  readonly schemaVersion: 'owner-review-decision-audit-fact.v1';
  readonly auditFactId: UUID;
  readonly operationId: UUID;
  readonly reviewSessionId: UUID;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly decision: 'pass' | 'changes_required';
  readonly changesRequiredIssueId: UUID | null;
  readonly priorTransitionFactHash: Sha256HexV1;
  readonly reviewArtifactHash: Sha256HexV1;
  readonly decidedAt: IsoUtcTimestamp;
  readonly factHash: Sha256HexV1;
}

interface OwnerReviewGeneratedIssueV2 extends ContentVersionRefV1 {
  readonly issueId: UUID;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly operationId: UUID;
  readonly decisionReceiptId: UUID;
  readonly category: ContentIssueCategory;
  readonly reason: NonEmptyTrimmedStringV1;
  readonly status: 'open';
  readonly reviewArtifactHash: Sha256HexV1;
  readonly reviewDecisionAuditFactId: UUID;
  readonly reviewDecisionAuditFactHash: Sha256HexV1;
  readonly createdAt: IsoUtcTimestamp;
}

interface RecordOwnerQuestionReviewResponseBaseV2 extends OwnerReviewTransitionResponseBaseV2 {
  readonly decisionReceiptId: UUID;
  readonly artifact: ContentOwnerPersonalReviewArtifactV1;
  readonly auditFact: OwnerReviewDecisionAuditFactV1;
}

type RecordOwnerQuestionReviewResponseV2 = RecordOwnerQuestionReviewResponseBaseV2 & (
  | {
      readonly decision: 'pass';
      readonly issue: null;
      readonly artifact: ContentOwnerPersonalReviewArtifactV1 & {
        readonly outcome: { readonly decision: 'pass'; readonly changesRequiredIssueId: null };
      };
      readonly auditFact: OwnerReviewDecisionAuditFactV1 & {
        readonly decision: 'pass'; readonly changesRequiredIssueId: null;
      };
    }
  | {
      readonly decision: 'changes_required';
      readonly issue: OwnerReviewGeneratedIssueV2;
      readonly artifact: ContentOwnerPersonalReviewArtifactV1 & {
        readonly outcome: { readonly decision: 'changes_required'; readonly changesRequiredIssueId: UUID };
      };
      readonly auditFact: OwnerReviewDecisionAuditFactV1 & {
        readonly decision: 'changes_required'; readonly changesRequiredIssueId: UUID;
      };
    }
);

type ReleaseActorRole = 'author' | 'technical' | 'editorial' | 'final';

interface StageContentReleaseRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly controlledPrivateArtifactId: UUID;
  readonly controlledPrivateArtifactObjectVersion: NonEmptyTrimmedStringV1;
  readonly controlledPrivateArtifactEtag: NonEmptyTrimmedStringV1;
  readonly controlledPrivateArtifactRawHash: Sha256HexV1;
  readonly hashSet: ReleaseHashSetV2;
  readonly manifest: ContentReleaseManifestV2;
  readonly sourceCommit: NonEmptyTrimmedStringV1;
  readonly runId: NonEmptyTrimmedStringV1;
  readonly executionClaim: ContentControlExecutionClaimV2<'stage'>;
}

interface StageContentReleaseResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly releaseManifestId: UUID;
  readonly operationPrincipalSnapshotId: UUID;
  readonly controlledPrivateArtifactId: UUID;
  readonly controlledPrivateArtifactObjectVersion: NonEmptyTrimmedStringV1;
  readonly controlledPrivateArtifactEtag: NonEmptyTrimmedStringV1;
  readonly controlledPrivateArtifactRawHash: Sha256HexV1;
  readonly hashSet: ReleaseHashSetV2;
  readonly sourceCommit: NonEmptyTrimmedStringV1;
  readonly runId: NonEmptyTrimmedStringV1;
  readonly stagedAt: IsoUtcTimestamp;
  readonly status: 'reviewing';
}

interface PersonalContentAcceptanceRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'personal_preview' };
}

interface ActivatePersonalPreviewRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly acceptanceId: UUID;
  readonly expectedSelectionRevision: NonNegativeSafeIntegerV1;
}

interface RevokePersonalContentAcceptanceRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly acceptanceId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
}

interface ContentReleaseAttestationRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly actorRole: ReleaseActorRole;
}

interface ContentReleaseAttestationResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly attestationId: UUID;
  readonly releaseManifestId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly actorRole: ReleaseActorRole;
  readonly actorPrincipalSnapshotId: UUID;
  readonly attestedAt: IsoUtcTimestamp;
  readonly status: 'active';
}

interface RevokeContentReleaseAttestationRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly attestationId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
}

interface RevokeContentReleaseAttestationResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly revocationId: UUID;
  readonly attestationId: UUID;
  readonly releaseManifestId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly revokedByPrincipalSnapshotId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
  readonly revokedAt: IsoUtcTimestamp;
  readonly status: 'revoked';
}

interface PublishContentReleaseRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly sourceCommit: NonEmptyTrimmedStringV1;
  readonly runId: NonEmptyTrimmedStringV1;
  readonly executionClaim: ContentControlExecutionClaimV2<'publish'>;
}

interface PublishContentReleaseResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
  readonly approvalId: UUID;
  readonly releaseManifestId: UUID;
  readonly operationPrincipalSnapshotId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly attestationIds: {
    readonly author: UUID;
    readonly technical: UUID;
    readonly editorial: UUID;
    readonly final: UUID;
  };
  readonly sourceCommit: NonEmptyTrimmedStringV1;
  readonly runId: NonEmptyTrimmedStringV1;
  readonly publishedAt: IsoUtcTimestamp;
  readonly status: 'published';
}

interface PersonalContentAcceptanceResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly dataGeneration: DataGeneration;
  readonly acceptanceId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'personal_preview' };
  readonly actorPrincipalSnapshotId: UUID;
  readonly acceptedAt: IsoUtcTimestamp;
  readonly status: 'accepted';
}

interface PersonalPreviewSelectionResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly dataGeneration: DataGeneration;
  readonly acceptanceId: UUID;
  readonly selectionRevision: number;
  readonly actorPrincipalSnapshotId: UUID;
  readonly active: true;
  readonly changedAt: IsoUtcTimestamp;
}

interface PersonalContentAcceptanceRevocationResponseV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly operationRequestHash: Sha256HexV1;
  readonly dataGeneration: DataGeneration;
  readonly revocationId: UUID;
  readonly acceptanceId: UUID;
  readonly revokedByPrincipalSnapshotId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
  readonly revokedAt: IsoUtcTimestamp;
  readonly affectedSessionIds: readonly UUID[];
  readonly status: 'revoked';
}
```

初期acceptanceはblueprint生成型`ContentAllocationDefinitionV1`をlosslessに検証し、`initialQuestionCount=500`以外を拒否します。章配分は同型の`officialExamStructureBasis`からlargest-remainderで再計算し、同剰余は章番号昇順にします。600への自動追加は禁止し、replacement不足100件以上、syllabus/LO・比率変更、または90日以上かつ当該LOの有効attempt 30件以上・初見正答率9000bp以上・未克服率500bp未満の学習飽和のいずれかをstrict assessmentへ固定し、owner承認とallocationVersion 2の新設計レビューを要求します。

```sql
public.begin_owner_question_review_session_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
public.get_owner_question_review_v2(p_request jsonb, p_csrf_token text) returns jsonb
public.submit_owner_question_blind_answer_v2(p_request jsonb, p_csrf_token text) returns jsonb
public.reveal_owner_question_review_v2(p_request jsonb, p_csrf_token text) returns jsonb
public.hide_owner_question_review_v2(p_request jsonb, p_csrf_token text) returns jsonb
public.complete_owner_question_review_audit_v2(p_request jsonb, p_csrf_token text) returns jsonb
public.record_owner_question_review_v2(p_request jsonb, p_csrf_token text) returns jsonb
private.stage_content_release_v2(p_request jsonb) returns jsonb
public.record_personal_content_acceptance_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
public.activate_personal_preview_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
public.revoke_personal_content_acceptance_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
public.record_content_release_attestation_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
public.revoke_content_release_attestation_v2(
  p_request jsonb,
  p_reauth_grant_token text
) returns jsonb
private.publish_content_release_v2(p_request jsonb) returns jsonb
```

review sessionの一意契約として、begin RPCだけがfresh recent-auth grantを一回消費してowner・bundle・canonical hashへ結合した30分TTL sessionと32-byte CSRF tokenを発行します。get/recordの「fresh recent-auth」はこの未失効sessionを指し、grantを一問ごとに再消費しません。全RPCはactive JWT、session、double-submit CSRF header/cookie一致を検証し、期限切れ時は保存済み進捗を失わず新sessionを要求します。

initial packetはstrict `OwnerQuestionReviewInitialPacketV1`だけで、学習画面と同じ`PreAnswerQuestionDto`を使い、正答集合、各choice正誤、全解説、`takeaway`、`commonTrap`、AI rationale/evaluation本文を全階層で禁止します。runtime enumはexact `blind | blind_submitted | revealed | hidden | audit_completed`で、状態機械はこの順の一方向だけです。ownerはblind状態でchoice stable ID集合とtrim後1～2,000文字の短い根拠を専用submit RPCへimmutable提出し、serverが根拠artifact bytesのhashを再計算してrequest hashと照合した後だけrevealを許可します。未提出reveal、提出choiceの差替え、reveal後再提出、skip、逆遷移を拒否します。hideで正答/解説/AI evidenceをpurgeした後、revealed audit/checklistの両artifact hashを専用audit-complete RPCへ保存し、`audit_completed`になったcurrent revisionだけdecisionを許可します。各遷移は別operation ID、未失効session、double-submit CSRF、current content/coverage hash、expected revision、直前fact hashを検証し、append-only factとDB `clock_timestamp()`の`blindSubmittedAt/answerKeyDisclosedAt/hiddenAt/auditCompletedAt`を同transactionで確定します。同operation ID同hashは保存response、別hashまたはstale revisionは拒否します。decision enumは`pass | changes_required`だけです。session失効、別問題遷移、logout時は正答・解説・AI本文をclient memory/DOM/cacheからpurgeします。

get/resume responseはcurrent questionについてruntime `state`、単調`reviewRevision`、初期blindだけnullで以後non-nullの`lastTransitionFactHash`、strict pre-answer packetだけを返します。top-levelとpacketのstate/revision/hashはexact一致し、stateが`revealed`でもresume/getは正答、解説、AI evidenceを再送しません。get/resumeはreadでありoperation IDを消費するtransitionではないためtransition receiptを発行せず、利用者がrevealed内容を再表示する場合だけ保存済みreveal operationのsame-ID/same-hash replayを明示的に行い、別operationでrevealを重ねません。blind-submit/reveal/hide/audit-complete/decisionの全transition responseは共通`OwnerReviewTransitionResponseBaseV2`を持ち、初回transactionでappend-only receipt ID、strict response bytes、request hash、`operationResponseHash=SHA-256(JCS(strict responseからoperationResponseHash自身だけを除いた値))`をdomain factと同時保存します。decisionでは`transitionReceiptId=decisionReceiptId`を必須にします。clientはreceipt ID/hash/response bytesをlocal transition receiptへlossless保存し、各transition/decisionのcommit responseを失っても同operation replayが同じreceipt IDを含む保存bytesをbyte-for-byte返します。reload後のgetはcommit済みstate/revision/last fact hashを返し、clientはlocal expected revision/hashと比較して、同じなら次段へ、serverが一段先なら応答喪失として保存response replay後にlocal receiptを補完し、別分岐なら`OWNER_REVIEW_STATE_CONFLICT`で停止します。operation receipt保存前のrollbackは旧state、receipt/fact/domain commit後は新stateだけを見せ、receipt欠落、response hash自己包含、response 1-bit差替え、partial commitを許可しません。

manifestとacceptanceで使用するowner artifact/coverageの唯一の正本はblueprint生成`ContentOwnerPersonalReviewArtifactV1` / `ContentOwnerPersonalReviewCoverageV1`です。APIは全fieldをlosslessに保持し、別名のowner artifact/coverageを設けません。runtime 5状態からblueprint 4段階への決定的射影は`blind -> blind`、`blind_submitted -> blind`、`revealed -> revealed`、`hidden -> hidden`、`audit_completed -> audit-completed`です。ただし`blind_submitted`を単に捨てず、そのimmutable factをblueprint artifactの`blindSubmittedChoiceStableIds/blindRationaleArtifactHash/blindSubmittedAt`へlosslessに写し、reveal時刻を`answerKeyDisclosedAt`、hide/audit-complete fact chainを`revealedAuditArtifactHash`、checklistをversion/result artifact hashへ写します。したがって生成artifactの`revealStateTransitions=['blind','revealed','hidden','audit-completed']`はblind submitを飛ばす経路ではありません。coverageはexpected 500 ref、current artifact ref/hash/decision、changes-required issue refを欠落・余剰・重複なく保持し、全500 decision pass・issue 0だけをacceptanceへ通します。

`record_owner_question_review_v2`の`changes_required` branchはclient指定issue IDを一切受けません。requestはcategoryとtrim後1～2,000文字のreasonだけを受け、serverがcontent ref、JWT owner principal、review operation、current audit-complete factへ結合したissue IDを初回transactionで生成します。同transactionでopen issue、初回issue fact、blueprint owner review artifact（outcomeの同issue ID）、decision audit fact、operation receipt、strict responseを全てappendし、issueのreview artifact hash/audit fact ID/hashと各content ref/owner/operationをdeferred FK/CHECKでexact一致させます。`response.issue.issueId = response.artifact.outcome.changesRequiredIssueId = response.auditFact.changesRequiredIssueId`、`response.transitionReceiptId = response.decisionReceiptId = response.issue.decisionReceiptId`、`response.issue.reviewDecisionAuditFactId/hash = response.auditFact.auditFactId/factHash`を必須同値とし、request・issue・artifact・audit・receiptのoperation ID、content ref、owner snapshotも同一でなければcommitしません。pass branchも`transitionReceiptId=decisionReceiptId`ですがissue=nullでissue row 0件です。同operation ID・同request hashは同じissue/artifact/audit/receipt response、別hashは`IDEMPOTENCY_KEY_REUSED`です。任意UUID、既存issue ID、別問題・別version・別owner issueの流用、category/reason欠落、issueだけまたはartifactだけのcommitを`OWNER_REVIEW_ISSUE_INVALID`で拒否します。CAS/state/hash不一致は`OWNER_REVIEW_STATE_CONFLICT`です。

初期productionは`personal-only`です。ただしD-04未決定中はpersonal/public manifest、stage、preview activation、content-control job、対応runtime capabilityを0件に固定します。D-04の`ContentAllocationApprovalArtifactV1`をowner本人が確定した後だけ初期personal経路を開始できます。owner review RPCは学習アプリと異なるallowlist済みreview originだけから、owner本人のactive JWT、短期review session、fresh recent-auth、CSRF tokenを検証して一問ずつ返します。responseへ`Cache-Control: no-store`、`Pragma: no-cache`、`Referrer-Policy: no-referrer`を付与し、CORSはexact review origin一つ、service worker/analytics/第三者script/query token/bearer linkを禁止します。review artifactはoperation IDと全artifact hashへ結合したappend-only rowで、同ID同hashだけ同response、current canonical/version不一致は拒否します。personal manifestはapproval artifactに加えcurrent 500 ref、generation 500、G0～G12 review 6,500、owner pass 500、未解決issue 0の場合だけ作成できます。public manifest/job/capability、public catalog、attestation、publishは将来の別rollout ADRとpublic gateで4自然人attestation等を全て満たすまで0件です。

AI review型とhashの唯一の正本はblueprint生成型`ContentGenerationArtifactV1`、`ContentAiEvaluationArtifactV1`、`ContentAiBlindSolveArtifactV1`、`ContentAiAdjudicationArtifactV1`、`ContentAiReviewCoverageV1`です。current 500 refへgeneration artifact exact 500、G0～G12のpass tuple/review artifact exact 6,500を要求します。G4のsingleとG8の数値claimなしだけがblueprint指定`not-applicable`を許され、それ以外とG12はpassです。G12は同じcontent/hash setのG0～G11 artifact hashをregistry順exact 12件参照し、generator、G2 blind reviewer、G12 adjudicatorのprovider/model/run tupleを相互に異ならせます。subject/content/canonical/blueprint/allocation/quality config/review policyの一つでも変われば同問題のgenerationとG0～G12を全失効し、一部carry-forwardを禁止します。DB deferred gateはexpected question 500、generation 500、required/review 6,500、content-ref×pass exact一件、stale/missing/extra/duplicate/unresolved issue 0、全FK/hash/independenceを再計算します。personal manifestはcoverage canonical bytesと`aiReviewCoverageHash`をlosslessに含め、outer manifest hashのpreimageへ含めます。countだけ、旧手書きAI型、manifest外artifactでgateを満たしません。

- private pipelineはcontrolled private artifactを固定Storage領域へcreate-only保存し、private canonicalizerと独立canonicalizerが同じraw/canonical hashを得た後にだけ候補をfreezeします。sampling、personal human review、accountability/identity/provenance coverageを完了してimmutable personal manifestを生成した後、初めてstage RPCを呼びます。stage transactionはrequestのartifact IDから固定bucket/keyを解決して任意URLをfetchせず、保存済みobject version/etag、stream再計算raw hash、`controlledPrivateArtifactRawHash=hashSet.rawHash=manifest.rawHash`を照合し、DB canonical/hashを独立再計算してcontent importとmanifestを同時にappendします。manifest前のcontent import、stage後のmanifest差替え、同じartifact IDのversion/etag差替えを禁止します。
- `ControlledPrivateReleaseArtifactV2`は`controlled_private_release_artifacts`のartifact ID、environment、固定bucket literal `controlled-private-release`、trim後non-empty object key/version/etag、positive-safe size、literal `application/json`、raw SHA-256、verification principal/timeを余剰・欠落なく表すinternal DTOです。全fieldを物理列とstrict artifact JSONへexact一致させ、artifact ID、`(bucket,objectKey,objectVersion)`、etagをcreate-only UNIQUEにします。client requestはURL、bucket、object key、content type、sizeを一切受けず、stage requestのartifact ID/version/etag/raw hashからserverが保存済みtupleを解決します。固定bucket以外、任意URL fetch、client指定key、HEAD結果と保存tuple不一致、`verificationStatus!='verified'`をjob作成前とstage transaction内のstream再検証で拒否します。
- `ContentControlJobV2`と`ContentControlExecutionClaimV2`は`content_control_jobs`/`content_control_claims`のoperation/job/kind/target ID/hash、human/internal operation ID、internal operation principal、internal logical request hash、runtime capability ID/hash、status、lease owner/expiry/fencing、claimed/released時刻へlosslessに対応します。stage/publish jobは`humanOperationId/enqueueReceiptId=null`でcontrolled pipelineだけがcreateし、suspend/retire jobは両field non-nullでrecent-auth済みhuman enqueue receiptだけがcreateします。human operation IDとserver-owned internal `operationId`は異なる値を要求します。enqueue receipt→job→claim→初回operation receiptを各exact一件のdeferred FK/UNIQUEで結び、job/claim/requestのinternal operation ID、kind、target、internal principal、`internalRequestHash`、capabilityをexact一致させます。human receiptのrequested-by principal/`humanRequestHash`との同値は要求せず、server mappingと明示linkだけを検証します。claimの未知field、client生成claim、別job claim、期限切れlease、古いfencingを初回実行で拒否します。operation receiptはjob IDへ一意に結合し、stage/publish/suspend/retireの`resolvedReauthGrantId`はnull固定です。
- stage/accept/activate/personal revoke/attestation revoke/attest/publishは上記生成strict request/responseだけを受け、全て`operationId`を必須にします。stageとpublish実行は専用content-control internal RPC、accept/activate/personal revoke/attestation revoke/attestは認証済み本人RPCです。final actorによるrecent-auth済みattestationを一般公開の最終approvalとし、publish workerは新しい人間approvalを自己生成せず4人attestationと全gateを再検証して原子的に公開します。全経路でmanifest branchとhash set stage、outer manifest hash、source commit/run、DB canonicalをexact一致させます。personal acceptanceはowner本人、`manifestStage='personal_preview'`のhash setへ結合した未使用recent-auth grant、staged import全hash一致を要求し、別tableへappendします。personal activate/revokeもowner、current data generation、acceptance/hash setへ結合したpurpose別fresh reauth grantを要求し、public release gateへ算入しません。4人attestationとinternal publishは`manifestStage='public_release'`だけを許可します。
- personal manifestはblueprint正本どおりgeneration 500件、G0～G12 review 6,500件、owner本人の一問単位pass 500件を要求します。これに加え、K3全件、multiple全件、blind solve不一致全件のpersonal human reviewと、K1/K2をstratum key `(chapterNumber,kLevel,selectionType)`ごとに`ceil(stratumSize / 5)`件の追加human sample reviewを要求します。sampleはowner全500 passを代替しません。候補500件とstratum所属をfreezeした後、release runnerから権限分離したsampling serviceだけが32-byte CSPRNG seedを一度発行し、署名済みartifact保存後の再発行・取消・再抽選を禁止します。freeze/rank/populationのexact preimage、quota、sort、carry-forward、署名対象、UNIQUE keyは[コンテンツblueprint v1 §3.2.1/§3.2.2](./content-blueprint-v1.md)だけを正本とし、本書の型と説明は生成表示です。全domain-separated preimageは例外なく`UTF8(blueprint記載のliteral) || 0x00 || JCS(payload)`であり、literalへNUL文字・`\0` escapeを埋め込む代替やdelimiter文字列連結を認めません。artifactの`blueprintHash`はpersonal manifestの`loBlueprintHash`とexact一致し、source-only変更でseed/sampleを変えず、canonical変更時も過去sample questionの新版と変更refをmandatory carry-forwardします。
- 全K3・全multiple・全blind disagreement・carry-forward・層化sampleの集合和をcontent refで重複除去し、runnerの任意選択を許さない。accountability review artifact、identity assertion、provenanceを各500 content refへexact一対一で拘束し、issue 0を要求する。public manifestはpersonal manifest hashをparentにし、Mobile/Web previewとtechnical/editorial各500を追加する。review artifactの追加ではpersonal manifestを更新せず新しいpublic manifestをappendする。content変更時は新canonical/new bundle/new personal manifest/new acceptanceからやり直す。
- normalized signature重複は0、embedding類似度は8200 basis points以上の候補をpersonal/publicの両stageで必ず拒否し、修正・再canonical化します。reviewer override、human例外承認、別phaseへの移送によって同一canonicalをreleaseへ通す経路は設けません。修正後の値だけを新bundle/new manifests/new acceptance/reviewsへ進めます。
- `OfficialSourceRequirementRegistryV1`、`OfficialSourceVerificationEvidenceV1`、`OfficialSourceVerificationCoverageV1`はblueprint生成型とexact一致するstrict DTOです。evidenceの`artifactHash`は自身だけを除外したstrict artifactのRFC 8785 JCS SHA-256です。coverageはregistry hash、固定3 source、固定6 claim、source順のevidence ID/artifact hash/exact version/retrievedAt/downloaded bytes hashを全て拘束し、personal/public manifestの`officialSourceVerificationCoverageHash`へ固定します。`ContentOfficialExamStructureBasisV1`のsource version/document hash/reviewedAt/evidence ID/hashはexam-structure evidenceのexact version/downloaded bytes hash/retrievedAt/evidence ID/artifact hashへ一致させます。required source/evidenceの欠落・余剰・重複、`verificationResult!='verified'`、URL/version/bytes/hash差替え、取得不能値からの推測digestではallocation生成、stage、40問/60分/26点policy activationを一切許可しません。
- 本節の`ContentProvenanceV2`、primitive、`ContentAccountabilityReviewArtifactV1`は`content-blueprint-v1.md`から生成された表示用抜粋で、API側で手動再定義しません。生成schema/type digestをprivate runner、DB、API、独立runnerで一致させます。`ContentProvenanceV2`はprivate sourceからpersonal manifestへ全fieldをlossless射影し、`authoredAt`、accountability artifact、全model run、normative source、terminology、copyright spanを省略・集約しない。normative source、model run、detected spanは規定keyのbyte昇順・重複なしで、V2→manifest全field mappingを生成schemaで固定する。public manifestはparent personal manifest hashを拘束し、provenanceを弱い別schemaへ再入力しない。literal provenance bytes/hashをprivate runner、DB、独立runnerで照合する。
- manifestの配列はcontent ref `(questionStableId,versionStableKey)`、review type、subject type、human principalまたはmodel provider/model/digest/run ID、artifact hashのbyte昇順へ固定し、content ref/review type/subjectの重複を拒否する。personal machine/blind/provenance、public technical/editorialは500 ref exact、preview artifactは500問をWeb/mobileで表示検査したcoverage artifactへ結合する。K3/multipleと層化母集団はallocationから独立再計算する。数値artifactはblueprintの`NumericOracleVerificationArtifactV1`をlosslessに使い、各entryを`(questionStableId,versionStableKey,claimKey)`のUTF-8 byte昇順・tuple unique、input recordをJCS key順、中間値keyとchoice binding choiceStableIdをUTF-8 byte昇順・uniqueにします。scalar/rational/rational-list input、formula、全中間値、rounding mode/scale、scalar/ordered-set expected/oracle、unit、全choice bindingを省略せず、expected/oracleのkind・exact/displayed値とbindingを独立再計算して100%一致させます。ordered-set/rational-listだけは意味順序を保持し、独断でsortしません。artifact hashはblueprint §3.2.1のpreimageだけから計算し、private source、DB、独立runnerが同じRFC 8785 bytes/hashへ一致し、tuple重複、input kind暗黙変換、配列swap、oracle値・binding差替えをfixture化します。
- subject組合せはmachine-gate=`system-run`、blind-solve=`model-run`、personal-human/technical/editorial/mobile-web-preview=`human`だけを許可し、別組合せをstrict schemaで拒否する。
- accountabilityの`subjectHash`は`ContentPrivateQuestionV3`から`provenance.accountableHuman.accountabilityReviewArtifactHash`だけを除いた`ContentPrivateQuestionAccountabilitySubjectV1`のRFC 8785 JCS hashです。canonical `contentHash`とは別のpreimageであり、両者を同値扱いしません。statement registryのliteralは`content-blueprint-v1.md`を唯一の正本とし、`statementHash=SHA-256(UTF8(statementLiteral))`です。identity assertionはcontent ref、subject hash、principal、statement version/hashを全て直接持ち、accountability artifact内の同fieldとexact一致しなければなりません。identity assertionの署名preimageは`signature`だけを除くartifact全体のRFC 8785 JCS UTF-8 bytes、署名はEd25519 64 bytesのbase64url no-padding、nonceは32 random bytesのbase64url no-paddingです。issuer/key IDで解決した32-byte public key、key validity、purpose/audience、authenticated/issued/expires時刻を検証し、別content ref・別subject・別statementへのassertion流用を拒否します。`assertionArtifactHash`は署名を含むartifact全体のRFC 8785 JCS hashです。
- personal previewを有効にした`(owner, certification, syllabus)`のactive selectionはexact 1件とし、未設定時だけ0件を許す。acceptance行を更新せずappend-only selection eventと単調revisionで切り替える。競合revisionは拒否する。active acceptanceのreviewing版が同一questionのpublished currentを置換し、bundleに含まれないquestionだけpublished currentを返す。他acceptanceのreviewing版は返さない。切替後も既存sessionは開始時acceptance/versionをpinするが、inactive/revoked acceptanceでは新規sessionを開始できない。
- selection切替だけなら旧acceptanceをpinした既存sessionを継続できます。明示revokeではoperation IDを冪等keyとし、同ID・全入力一致は同じrevocation ID/response、異内容は拒否します。該当acceptanceの全active sessionを同transactionでinvalidatedへ収束させ、`content.acceptance-revoked` changeを発行し、本文・choices・feedbackを返さないtombstoneへ置換します。clientはcacheをpurgeしますが、offline端末へ既配布の本文・feedbackは次回同期まで物理回収できません。
- release attestationはauthor/technical/editorial/finalの4人の自然人、4つの異なるactor IDを要求し、finalはownerだけを許可する。
- actor IDは引数にせず`auth.uid()`から得る。profile roleとstaged import全hashを再検証する。
- 全release operationはunknown key、widened hash、空reason、actor/role/hash差替えを拒否します。reauth grant tokenはstrict request JSON、operation receipt、DB/logへ含めず、専用secret parameterで受けて即時hash lookupします。`operationPrincipalSnapshotId`はclient経路では認証済み本人、internal stage/publish/suspend/retireではjob/claim/lease/fencing検証済みcontent-control workerのimmutable principal snapshotです。authenticated accept/activate/personal revoke/attest/attestation revokeだけがfresh recent-auth grantを初回成功時に消費します。internal 4操作は`resolvedReauthGrantId=null`固定でhuman grantを受けません。client操作の`operationRequestHash=SHA-256(JCS({request,operationPrincipalSnapshotId,resolvedReauthGrantId}))`、internal操作は§10のexecution claimを除くlogical request preimageを使います。operation receiptへoperation ID、kind、request hash、principal snapshot ID、resolved grant ID、content-control job ID、保存済みstrict response bytes/hashをappend-only保存します。専用role ACL確認後に同じoperation ID・kind・request hash・principalの保存receiptがあれば、grant/claim/lease/fencingのcurrent stateより先に保存済みresponseをbyte-for-byte返します。receiptがない初回だけgrantまたはjob/claimを検証し、同じIDで別hash/principal/kindを拒否します。publish requestのexecution claimはDB保存済みjob/claimとexact一致させ、final attestor本人のprincipalをinternal worker principalへ置換しません。
- revokeは本人または理由付きowner/adminだけで、対象public releaseが未publishの間だけ許可します。revoke済みattestationをgateへ数えず、revocationはappend-onlyです。publish approvalが一件でも存在するmanifestのattestation revokeは`CONTENT_RELEASE_ALREADY_PUBLISHED`で拒否し、公開後の事故対応は§10のsuspend、内容改訂はnew version/new bundle/new personal/public manifest/new attestation/new releaseで行います。公開済みapproval/attestationを遡及更新しません。
- 一問変更でhashが変われば全attestationを取り直す。
- publish時に全hash、allocation、全actor/role/time/revoke、DB canonical、operation metadataを再検証し、exact 4 active attestation IDをresponseへ固定する。publishは一manifest一approvalのappend-only operationで、同じoperation ID/hashのreplayだけ同じapproval/responseへ収束する。

allocation/corpus/review/quality/blueprint/oracle/provenance-accountability coverageを含む全補助hashの唯一の正本は[コンテンツblueprint v1 §3.2.1](./content-blueprint-v1.md)です。本節の同名型・field・説明はその生成表示であり、preimage、除外field、配列順、domain literalを独立に定義・上書きしません。生成schema digestをprivate runner、DB、API、独立runnerで照合し、差があればreleaseをfail-closedにします。domain separatorがある補助hashは必ず`UTF8(literal) || 0x00 || JCS(payload)`のbyte列を使い、文字列中のNUL、`\0`、delimiter連結を同値扱いしません。

本書だけを正本にできるhashはAPI境界固有のouter envelope、すなわちstrict private artifact bytesの`rawHash`、`ContentCanonicalQuestionVersionV2`の`contentHash`、`ContentCanonicalReleaseV2`の`canonicalHash`、および`ReleaseHashSetV2.manifestHash`です。`PersonalPreviewReleaseManifestV2`と`PublicReleaseManifestV2`のbranch自体はself hash fieldを持たず、`ReleaseHashSetV2.manifestHash = SHA-256(JCS(strict ContentReleaseManifestV2の該当branch全field))`だけを唯一のmanifest hashとします。stage別aliasまたはbranch内self hash fieldを生成・保存・受理しません。補助hashをouter envelope内部で再計算した値へ置換せず、blueprint §3.2.1に従って再計算したembedded値との一致を別に検証します。全hash/digest fieldは`Sha256HexV1`、literal goldenはexact preimage UTF-8 hex、digest、1-bit変更、branchへのself hash/alias混入、配列swap、Unicode非正規化を含み、実装関数自身からexpectedを生成しません。

`rawHash`はstrict `ContentPrivateQuestionV3[]` artifactの保存bytesそのもののSHA-256です。各`contentHash=SHA-256(JCS(ContentCanonicalQuestionVersionV2))`、bundle `canonicalHash=SHA-256(JCS(ContentCanonicalReleaseV2))`です。manifestはbranch全fieldをそのままJCS化し、そのdigestを別objectの`ReleaseHashSetV2.manifestHash`へ保存します。branchにhash fieldはないためmanifest preimageから除外するfieldもありません。stage request、DB release hash-set row、private runner、独立runnerはbranch bytesと`manifestStage`を照合して同じdigestを再計算し、`hashSet.manifestHash`へexact一致させます。branchへの`manifestHash`追加、alias column、stage違いbranch、保存branch差替えを拒否します。`contentHash`/`canonicalHash`の各self hash除外はそれぞれのstrict型定義に従い、manifest規則へ流用しません。release questionsはquestion stable ID、version no、version stable key、fact/artifact/premise/claim/choiceを各stable keyのbyte昇順へ正規化し、reasoning stepは`stepNumber`の数値昇順へ固定します。reasoning stepは1始まり、重複なし、欠番なし、1～12のsafe integerです。全参照key、`relevantPremiseKeys`、`relevantClaimKeys`、`addressedPremiseKeys`、`addressedClaimKeys`、`correctChoiceStableIds`はUTF-8 byte昇順・重複なしで、`relevantClaimKeys`はnon-emptyかつ同じ問題の`askedClaims.claimKey`だけを参照します。数値claimではそのclaimを`relevantClaimKeys`に持つchoice stable ID集合と`choiceValueBindings`のchoice stable ID集合をexact一致させます。`takeaway`と`commonTrap`はtrim後non-emptyの学習表示用canonical metadataとして`ContentCanonicalQuestionVersionV2`、DB canonical基礎行、`contentHash`の全てへ含め、pre-answer catalog/session DTOへは射影しません。回答確定後のrevealed feedbackだけが同値を返し、suspend/revoke tombstoneは両方nullです。正答集合は同versionのchoice stable IDだけで件数がrequired countとexact一致します。DB UUIDはbytes/sortから除外します。raw/canonical/manifest branchと1～12 reasoning stepのliteral outer envelope bytes/digest、正答だけswap、source-only変更、別DB UUID、順序入替をDB/private/独立runnerで照合し、実装関数自身でexpectedを作りません。sanitized reportへ正答集合を出しません。`LearningObjectiveCountsV1`は64 key exactで、extra/missing keyとblueprint quota不一致をruntime schema・DB gateの両方で拒否します。`patternFamilyId`と全enumは対象LOの承認済みblueprint registry所属を再検証します。

private bundleの正本は`content-blueprint-v1.md`の`ContentPrivateQuestionV3`で、全fieldを含む入力bytesを`rawHash`へ結合します。chapter/section/LO titleとKは承認済みblueprint registryから導出し、fact/artifact/premise/asked claim/reasoning step/choice意味対応を含む公開DBの意味fieldを上記canonical projectionへ写像します。numeric oracle、provenance/auditなどrelease検証専用fieldはcanonical projectionへ含めませんが、raw hash、oracle verification artifact、provenance coverage hashへ結合されるため、変更時はpersonal/public両manifestとacceptance/attestationを作り直します。

各manifestのembedded `reviewCoverage/identityAssertionCoverage/accountabilityCoverage/provenanceCoverage`はblueprint生成strict型のcanonical bytesをlosslessに保持し、各embedded object内hashは同名top-level coverage hashとexact一致させます。personal/publicのrequired refs、artifact refs、issue refsをphase policyから独立再計算し、空required set、欠落、余剰、重複、親personal coverageの弱化を拒否します。

## 14. Privileged Control Plane contract

```ts
type ExportFormatV2 = 'portable_json' | 'csv';

interface ReauthIdentityCredentialV2 {
  readonly type: 'password';
  readonly currentPassword: string;
}

interface PersonalContentAcceptanceTargetV2 {
  readonly operationId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'personal_preview' };
}

interface PersonalPreviewActivationTargetV2 {
  readonly operationId: UUID;
  readonly acceptanceId: UUID;
  readonly expectedSelectionRevision: NonNegativeSafeIntegerV1;
}

interface PersonalContentAcceptanceRevocationTargetV2 {
  readonly operationId: UUID;
  readonly acceptanceId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
}

interface ContentReleaseAttestationTargetV2 {
  readonly operationId: UUID;
  readonly hashSet: ReleaseHashSetV2 & { readonly manifestStage: 'public_release' };
  readonly actorRole: ReleaseActorRole;
}

interface ContentReleaseAttestationRevocationTargetV2 {
  readonly operationId: UUID;
  readonly attestationId: UUID;
  readonly reason: NonEmptyTrimmedStringV1;
}

type ReauthGrantRequestV2 =
  | { readonly purpose: 'export'; readonly dataGeneration: DataGeneration; readonly identityCredential: ReauthIdentityCredentialV2; readonly target: { readonly format: ExportFormatV2 } }
  | {
      readonly purpose: 'restore_enqueue';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: { readonly uploadId: UUID; readonly objectSha256: Sha256HexV1; readonly exportId: UUID };
    }
  | {
      readonly purpose: 'restore_confirm';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: { readonly restoreJobId: UUID; readonly dryRunReportHash: Sha256HexV1 };
    }
  | {
      readonly purpose: 'account_delete';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: { readonly challengeId: UUID };
    }
  | {
      readonly purpose: 'personal_content_acceptance';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: PersonalContentAcceptanceTargetV2;
    }
  | {
      readonly purpose: 'personal_preview_activate';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: PersonalPreviewActivationTargetV2;
    }
  | {
      readonly purpose: 'personal_content_acceptance_revoke';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: PersonalContentAcceptanceRevocationTargetV2;
    }
  | {
      readonly purpose: 'content_release_attestation';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: ContentReleaseAttestationTargetV2;
    }
  | {
      readonly purpose: 'content_release_attestation_revoke';
      readonly dataGeneration: DataGeneration;
      readonly identityCredential: ReauthIdentityCredentialV2;
      readonly target: ContentReleaseAttestationRevocationTargetV2;
    };

type ReauthPurpose = ReauthGrantRequestV2['purpose'];

interface ReauthGrantBaseV2 {
  readonly grantId: UUID;
  readonly ownerUserId: UUID;
  readonly dataGeneration: DataGeneration;
  readonly targetHash: Sha256HexV1;
  readonly identityReauthenticatedAt: IsoUtcTimestamp;
  readonly issuedAt: IsoUtcTimestamp;
  readonly expiresAt: IsoUtcTimestamp;
  readonly usedAt: IsoUtcTimestamp | null;
}

type ReauthGrantV2 =
  | (ReauthGrantBaseV2 & { readonly purpose: 'export'; readonly target: { readonly format: ExportFormatV2 } })
  | (ReauthGrantBaseV2 & {
      readonly purpose: 'restore_enqueue';
      readonly target: { readonly uploadId: UUID; readonly objectSha256: Sha256HexV1; readonly exportId: UUID };
    })
  | (ReauthGrantBaseV2 & {
      readonly purpose: 'restore_confirm';
      readonly target: { readonly restoreJobId: UUID; readonly dryRunReportHash: Sha256HexV1 };
    })
  | (ReauthGrantBaseV2 & { readonly purpose: 'account_delete'; readonly target: { readonly challengeId: UUID } })
  | (ReauthGrantBaseV2 & { readonly purpose: 'personal_content_acceptance'; readonly target: PersonalContentAcceptanceTargetV2 })
  | (ReauthGrantBaseV2 & { readonly purpose: 'personal_preview_activate'; readonly target: PersonalPreviewActivationTargetV2 })
  | (ReauthGrantBaseV2 & { readonly purpose: 'personal_content_acceptance_revoke'; readonly target: PersonalContentAcceptanceRevocationTargetV2 })
  | (ReauthGrantBaseV2 & {
      readonly purpose: 'content_release_attestation';
      readonly target: ContentReleaseAttestationTargetV2;
    })
  | (ReauthGrantBaseV2 & {
      readonly purpose: 'content_release_attestation_revoke';
      readonly target: ContentReleaseAttestationRevocationTargetV2;
    });

type ReauthGrantCredentialV2 = ReauthGrantV2 & { readonly grantToken: Base64Url32BytesV1 };

// personal_content_acceptanceのgeneration正本はrequest/grant base直下だけ。targetへ重複させない。

type DataJobKind = 'export' | 'restore' | 'account_delete';
type InternalDataJobStatusV2 =
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'failed'
  | 'dead_lettered';

type PublicDataJobStatusV2 = 'queued' | 'running' | 'completed' | 'failed';

type InternalRestorePhaseV2 =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'dry_run_ready'
  | 'applying'
  | 'applied'
  | 'failed';

type PublicRestoreJobStatusV2 =
  | 'uploaded'
  | 'validated'
  | 'dry_run_ready'
  | 'applying'
  | 'applied'
  | 'failed';

interface RestoreUploadReservationV2 {
  readonly uploadId: UUID;
  readonly ownerUserId: UUID;
  readonly bucketAlias: 'private-user-restore';
  readonly objectKey: NonEmptyTrimmedStringV1;
  readonly maxBytes: number;
  readonly requiredContentType: 'application/json';
  readonly expectedObjectSha256: Sha256HexV1;
  readonly createOnly: true;
  readonly uploadUrl: NonEmptyTrimmedStringV1;
  readonly uploadUrlExpiresAt: IsoUtcTimestamp;
}

interface VerifiedRestoreObjectV2 {
  readonly uploadId: UUID;
  readonly objectVersion: NonEmptyTrimmedStringV1;
  readonly etag: NonEmptyTrimmedStringV1;
  readonly sizeBytes: number;
  readonly contentType: 'application/json';
  readonly objectSha256: Sha256HexV1;
  readonly verifiedAt: IsoUtcTimestamp;
}

interface RestoreDryRunCountsV2 {
  readonly profile: 1;
  readonly canonicalEvents: NonNegativeSafeIntegerV1;
  readonly commandReceipts: NonNegativeSafeIntegerV1;
  readonly selectionBases: NonNegativeSafeIntegerV1;
  readonly activeUnconsumedTargetSelectionBases: NonNegativeSafeIntegerV1;
  readonly personalContentAcceptances: NonNegativeSafeIntegerV1;
  readonly acceptanceRevocations: NonNegativeSafeIntegerV1;
  readonly previewSelectionEvents: NonNegativeSafeIntegerV1;
  readonly sessions: NonNegativeSafeIntegerV1;
  readonly sessionItems: NonNegativeSafeIntegerV1;
  readonly sessionItemInvalidations: NonNegativeSafeIntegerV1;
  readonly drafts: NonNegativeSafeIntegerV1;
  readonly attempts: NonNegativeSafeIntegerV1;
  readonly attemptCorrections: NonNegativeSafeIntegerV1;
  readonly attemptInvalidations: NonNegativeSafeIntegerV1;
  readonly actorMap: NonNegativeSafeIntegerV1;
  readonly examTerminals: NonNegativeSafeIntegerV1;
  readonly examResultRevisions: NonNegativeSafeIntegerV1;
  readonly sessionLifecycleFacts: NonNegativeSafeIntegerV1;
  readonly offlineExamReferences: NonNegativeSafeIntegerV1;
  readonly offlineReferenceResultRevisions: NonNegativeSafeIntegerV1;
  readonly offlineReferenceFeedbackRevisions: NonNegativeSafeIntegerV1;
  readonly bookmarks: NonNegativeSafeIntegerV1;
  readonly notes: NonNegativeSafeIntegerV1;
  readonly issues: NonNegativeSafeIntegerV1;
  readonly issueUpdates: NonNegativeSafeIntegerV1;
}

type RestoreConflictCodeV2 =
  | 'DUPLICATE_FACT_ID'
  | 'BROKEN_FACT_REFERENCE'
  | 'UNSUPPORTED_SOURCE_SCHEMA'
  | 'OWNER_MISMATCH'
  | 'TARGET_NOT_EMPTY'
  | 'REVOKED_SIGNING_KEY'
  | 'MANIFEST_SIGNATURE_INVALID'
  | 'PAYLOAD_HASH_MISMATCH';

interface RestoreSourceIdentitySetSummaryV2 {
  readonly count: NonNegativeSafeIntegerV1;
  readonly setHash: Sha256HexV1;
}

interface RestoreSourceIdentitySetV2<T> extends RestoreSourceIdentitySetSummaryV2 {
  readonly values: readonly T[];
}

interface RestoreContentReferenceIdentityV2 {
  readonly questionId: QuestionId;
  readonly questionVersionId: QuestionVersionId;
}

type PortableFactIdentityKindV2 =
  | 'personal-content-acceptance'
  | 'acceptance-revocation'
  | 'preview-selection'
  | 'session'
  | 'session-item'
  | 'session-item-invalidation'
  | 'draft'
  | 'attempt'
  | 'attempt-correction'
  | 'attempt-invalidation'
  | 'exam-terminal'
  | 'exam-result-revision'
  | 'session-lifecycle'
  | 'offline-reference'
  | 'offline-result-revision'
  | 'offline-feedback-revision'
  | 'bookmark'
  | 'note'
  | 'issue'
  | 'issue-update';

interface RestorePortableFactIdentitySetV2 extends RestoreSourceIdentitySetV2<UUID> {
  readonly factKind: PortableFactIdentityKindV2;
}

interface RestorePortableFactIdentitySetSummaryV2 extends RestoreSourceIdentitySetSummaryV2 {
  readonly factKind: PortableFactIdentityKindV2;
}

interface RestoreSourceIdentityArtifactV2 {
  readonly schemaVersion: 'restore-source-identity-artifact.v2';
  readonly artifactId: UUID;
  readonly restoreJobId: UUID;
  readonly sourceExportId: UUID;
  readonly sourceDataGeneration: DataGeneration;
  readonly sourcePayloadHash: Sha256HexV1;
  readonly ownerUserIds: RestoreSourceIdentitySetV2<UUID>;
  readonly actorPrincipalSnapshotDigests: RestoreSourceIdentitySetV2<Sha256HexV1>;
  readonly actorExportPseudonyms: RestoreSourceIdentitySetV2<Base64Url32BytesV1>;
  readonly portableFactIdsByKind: readonly RestorePortableFactIdentitySetV2[];
  readonly contentReferences: RestoreSourceIdentitySetV2<RestoreContentReferenceIdentityV2>;
  readonly sessionIds: RestoreSourceIdentitySetV2<UUID>;
  readonly canonicalEventIds: RestoreSourceIdentitySetV2<UUID>;
  readonly commandIds: RestoreSourceIdentitySetV2<UUID>;
  readonly selectionBasisIds: RestoreSourceIdentitySetV2<UUID>;
  readonly artifactHash: Sha256HexV1;
}

interface RestoreSourceIdentitySetsV2 {
  readonly artifactId: UUID;
  readonly artifactHash: Sha256HexV1;
  readonly setsHash: Sha256HexV1;
  readonly ownerUsers: RestoreSourceIdentitySetSummaryV2;
  readonly actorPrincipalSnapshotDigests: RestoreSourceIdentitySetSummaryV2;
  readonly actorExportPseudonyms: RestoreSourceIdentitySetSummaryV2;
  readonly portableFactsByKind: readonly RestorePortableFactIdentitySetSummaryV2[];
  readonly contentReferences: RestoreSourceIdentitySetSummaryV2;
  readonly sessions: RestoreSourceIdentitySetSummaryV2;
  readonly canonicalEvents: RestoreSourceIdentitySetSummaryV2;
  readonly commands: RestoreSourceIdentitySetSummaryV2;
  readonly selectionBases: RestoreSourceIdentitySetSummaryV2;
}

interface RestoreDryRunReportV2 {
  readonly restoreJobId: UUID;
  readonly status: 'dry_run_ready';
  readonly targetMode: 'empty-learning-namespace-only';
  readonly reportHash: Sha256HexV1;
  readonly sourceDataGeneration: DataGeneration;
  readonly targetDataGeneration: DataGeneration;
  readonly counts: RestoreDryRunCountsV2;
  readonly sourceIdentitySets: RestoreSourceIdentitySetsV2;
  readonly conflicts: readonly { readonly code: RestoreConflictCodeV2; readonly entityId: NonEmptyTrimmedStringV1 }[];
  readonly activeUnconsumedSelectionBasisIds: readonly UUID[];
  readonly canApply: boolean;
}

interface DeletionRetentionPolicySnapshotV2 {
  readonly selectionId: 'D03-A';
  readonly policyVersion: NonEmptyTrimmedStringV1;
  readonly backupEnabled: true;
  readonly retentionDays: 30;
  readonly rpoHours: 24;
  readonly rtoHours: 8;
  readonly liveDeletionSloHours: 24;
  readonly backupEffectiveDeletionSloDays: 30;
  readonly privacyAdrId: null;
  readonly privacyAdrHash: null;
}

type ActiveProductionDeletionRetentionPolicySnapshotV2 = DeletionRetentionPolicySnapshotV2;

interface DeletionPolicyBindingV2 {
  readonly deletionPolicyActivationFactId: UUID;
  readonly deletionPolicyActivationRevision: PositiveSafeIntegerV1;
  readonly deletionPolicyEnvironment: 'production';
  readonly deletionRetentionPolicySnapshotId: UUID;
  readonly deletionRetentionPolicy: ActiveProductionDeletionRetentionPolicySnapshotV2;
  readonly deletionRetentionPolicyHash: Sha256HexV1;
}

interface DeletionRetentionPolicyActivationFactV2 {
  readonly activationFactId: UUID;
  readonly environment: 'production';
  readonly activationRevision: PositiveSafeIntegerV1;
  readonly policySnapshotId: UUID;
  readonly policy: ActiveProductionDeletionRetentionPolicySnapshotV2;
  readonly policyHash: Sha256HexV1;
  readonly activatedByPrincipalSnapshotId: UUID;
  readonly operationId: UUID;
  readonly activatedAt: IsoUtcTimestamp;
}

interface ActivateDeletionRetentionPolicyRequestV2 {
  readonly contractVersion: 2;
  readonly operationId: UUID;
  readonly environment: 'production';
  readonly expectedActivationRevision: NonNegativeSafeIntegerV1;
  readonly policySnapshotId: UUID;
  readonly policy: ActiveProductionDeletionRetentionPolicySnapshotV2;
  readonly policyHash: Sha256HexV1;
}

interface ActivateDeletionRetentionPolicyResponseV2
  extends DeletionRetentionPolicyActivationFactV2 {
  readonly contractVersion: 2;
  readonly operationRequestHash: Sha256HexV1;
  readonly operationResponseHash: Sha256HexV1;
}

interface AccountDeletionChallengeV2 extends DeletionPolicyBindingV2 {
  readonly challengeId: UUID;
  readonly phrase: NonEmptyTrimmedStringV1;
  readonly expiresAt: IsoUtcTimestamp;
}

interface AccountDeletionReceiptV2 extends DeletionPolicyBindingV2 {
  readonly deletionJobId: UUID;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly acceptedAt: IsoUtcTimestamp;
  readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
  readonly deletionSloDeadlineAt: IsoUtcTimestamp;
  readonly receiptToken: Base64Url32BytesV1;
  readonly receiptExpiresAt: IsoUtcTimestamp;
}

interface InternalAccountDeletionJobV2 extends DeletionPolicyBindingV2 {
  readonly deletionJobId: UUID;
  readonly ownerPrincipalSnapshotId: UUID;
  readonly challengeId: UUID;
  readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
  readonly deletionSloDeadlineAt: IsoUtcTimestamp;
  readonly operationId: UUID;
  readonly operationPrincipalSnapshotId: UUID;
  readonly requestHash: Sha256HexV1;
  readonly acceptedAt: IsoUtcTimestamp;
  readonly status: InternalDataJobStatusV2;
}

type AccountDeletionReceiptStatusV2 = DeletionPolicyBindingV2 & (
  | {
      readonly deletionJobId: UUID;
      readonly status: 'pending';
      readonly acceptedAt: IsoUtcTimestamp;
      readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
      readonly deletionSloDeadlineAt: IsoUtcTimestamp;
      readonly completedAt: null;
      readonly ledgerEntryHash: null;
      readonly archiveReceiptHash: null;
      readonly failureCode: null;
    }
  | {
      readonly deletionJobId: UUID;
      readonly status: 'completed';
      readonly acceptedAt: IsoUtcTimestamp;
      readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
      readonly deletionSloDeadlineAt: IsoUtcTimestamp;
      readonly completedAt: IsoUtcTimestamp;
      readonly ledgerEntryHash: Sha256HexV1;
      readonly archiveReceiptHash: Sha256HexV1;
      readonly failureCode: null;
    }
  | {
      readonly deletionJobId: UUID;
      readonly status: 'failed';
      readonly acceptedAt: IsoUtcTimestamp;
      readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
      readonly deletionSloDeadlineAt: IsoUtcTimestamp;
      readonly completedAt: null;
      readonly ledgerEntryHash: null;
      readonly archiveReceiptHash: null;
      readonly failureCode: 'CONTROL_PLANE_FAILED' | 'DEAD_LETTERED';
    }
);

interface AccountDeletionLedgerEntryV2 extends DeletionPolicyBindingV2 {
  readonly schemaVersion: 'account-deletion-ledger-entry.v2';
  readonly sequence: PositiveSafeIntegerV1;
  readonly deletionJobId: UUID;
  readonly principalSnapshotId: UUID;
  readonly subjectDigestVersion: 'auth-subject-digest.v2';
  readonly subjectIssuer: NonEmptyTrimmedStringV1;
  readonly subjectDigestAlgorithm: 'HMAC-SHA-256';
  readonly subjectDigestKeyId: NonEmptyTrimmedStringV1;
  readonly subjectDigest: Sha256HexV1;
  readonly acceptedAt: IsoUtcTimestamp;
  readonly completedAt: IsoUtcTimestamp;
  readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
  readonly deletionSloDeadlineAt: IsoUtcTimestamp;
  readonly scope: readonly ['database', 'auth', 'storage'];
  readonly operationId: UUID;
  readonly sourceMainCommit: NonEmptyTrimmedStringV1;
  readonly signerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface ExternalAccountDeletionTombstoneV2 extends DeletionPolicyBindingV2 {
  readonly schemaVersion: 'external-account-deletion-tombstone.v2';
  readonly ledgerSequence: PositiveSafeIntegerV1;
  readonly deletionJobId: UUID;
  readonly subjectDigestVersion: 'auth-subject-digest.v2';
  readonly subjectIssuer: NonEmptyTrimmedStringV1;
  readonly subjectDigestAlgorithm: 'HMAC-SHA-256';
  readonly subjectDigestKeyId: NonEmptyTrimmedStringV1;
  readonly subjectDigest: Sha256HexV1;
  readonly storageNamespaceRuleVersion: 'owner-subject-digest.v2';
  readonly storageSubjectDigestAlgorithm: 'HMAC-SHA-256';
  readonly storageSubjectDigestKeyId: NonEmptyTrimmedStringV1;
  readonly storageSubjectDigest: Sha256HexV1;
  readonly scope: readonly ['database', 'auth', 'storage'];
  readonly acceptedAt: IsoUtcTimestamp;
  readonly completedAt: IsoUtcTimestamp;
  readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
  readonly deletionSloDeadlineAt: IsoUtcTimestamp;
  readonly operationId: UUID;
  readonly sourceMainCommit: NonEmptyTrimmedStringV1;
  readonly signerKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface AccountDeletionArchiveReceiptV2 extends DeletionPolicyBindingV2 {
  readonly schemaVersion: 'account-deletion-archive-receipt.v2';
  readonly archiveSequence: PositiveSafeIntegerV1;
  readonly ledgerSequence: PositiveSafeIntegerV1;
  readonly ledgerEntryHash: Sha256HexV1;
  readonly externalTombstoneHash: Sha256HexV1;
  readonly storageSubjectDigest: Sha256HexV1;
  readonly deletionRetentionExpiresAt: IsoUtcTimestamp;
  readonly deletionSloDeadlineAt: IsoUtcTimestamp;
  readonly archiveSystemId: NonEmptyTrimmedStringV1;
  readonly objectKey: NonEmptyTrimmedStringV1;
  readonly objectVersion: NonEmptyTrimmedStringV1;
  readonly etag: NonEmptyTrimmedStringV1;
  readonly objectSha256: Sha256HexV1;
  readonly archivedAt: IsoUtcTimestamp;
  readonly verifiedAt: IsoUtcTimestamp;
  readonly archiveKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

interface OwnDataJobBaseV2 {
  readonly jobId: UUID;
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
  readonly completedAt: IsoUtcTimestamp | null;
  readonly errorCode:
    | 'JOB_CONFLICT'
    | 'RESTORE_MANIFEST_INVALID'
    | 'RESTORE_OWNER_MISMATCH'
    | 'RESTORE_TARGET_NOT_EMPTY'
    | 'CONTROL_PLANE_FAILED'
    | 'DEAD_LETTERED'
    | null;
}

type OwnDataJobDtoV2 =
  | (OwnDataJobBaseV2 & {
      readonly kind: 'export';
      readonly status: PublicDataJobStatusV2;
      readonly exportFormat: ExportFormatV2;
      readonly downloadUrl: NonEmptyTrimmedStringV1 | null;
      readonly downloadExpiresAt: IsoUtcTimestamp | null;
      readonly downloadContentType: 'application/json' | 'application/zip' | null;
      readonly downloadSha256: Sha256HexV1 | null;
    })
  | (OwnDataJobBaseV2 & {
      readonly kind: 'restore';
      readonly status: PublicRestoreJobStatusV2;
      readonly dryRunReport: RestoreDryRunReportV2 | null;
      readonly appliedDataGeneration: DataGeneration | null;
    })
  | (OwnDataJobBaseV2 & {
      readonly kind: 'account_delete';
      readonly status: PublicDataJobStatusV2;
      readonly receiptAvailable: boolean;
    });

interface DisasterRecoveryPolicySnapshotV2 {
  readonly schemaVersion: 'disaster-recovery-policy-snapshot.v2';
  readonly drPolicySnapshotId: UUID;
  readonly environment: 'production';
  readonly d03Option: 'A';
  readonly policyVersion: NonEmptyTrimmedStringV1;
  readonly retentionDays: 30;
  readonly rpoHours: 24;
  readonly rtoHours: 8;
  readonly deletionSloHours: 24;
  readonly backupScope: readonly ['database', 'auth', 'storage'];
  readonly kmsPolicyVersion: NonEmptyTrimmedStringV1;
  readonly regionPolicy: NonEmptyTrimmedStringV1;
  readonly approvedByPrincipalSnapshotId: UUID;
  readonly approvedAt: IsoUtcTimestamp;
  readonly policyHash: Sha256HexV1;
}

interface DisasterRecoveryBackupManifestV2 extends DeletionPolicyBindingV2 {
  readonly schemaVersion: 'dr-backup-manifest.v2';
  readonly backupSetId: UUID;
  readonly environment: 'production';
  readonly sourceMainCommit: NonEmptyTrimmedStringV1;
  readonly consistencyBarrierId: UUID;
  readonly drPolicySnapshotId: UUID;
  readonly drPolicySnapshot: DisasterRecoveryPolicySnapshotV2;
  readonly drPolicySnapshotHash: Sha256HexV1;
  readonly deletionRetentionPolicy: ActiveProductionDeletionRetentionPolicySnapshotV2;
  readonly databaseLsnStart: NonEmptyTrimmedStringV1;
  readonly databaseLsnEnd: NonEmptyTrimmedStringV1;
  readonly authChangeUpperBound: NonEmptyTrimmedStringV1;
  readonly storageChangeUpperBound: NonEmptyTrimmedStringV1;
  readonly objectVersionInventoryHash: Sha256HexV1;
  readonly database: {
    readonly providerRestorePointId: NonEmptyTrimmedStringV1;
    readonly pitTimestamp: IsoUtcTimestamp;
    readonly lsn: NonEmptyTrimmedStringV1;
  };
  readonly auth: {
    readonly snapshotAt: IsoUtcTimestamp;
    readonly principalCount: NonNegativeSafeIntegerV1;
    readonly snapshotSha256: Sha256HexV1;
  };
  readonly storage: {
    readonly inventorySha256: Sha256HexV1;
    readonly objectCount: NonNegativeSafeIntegerV1;
    readonly totalBytes: NonNegativeSafeIntegerV1;
  };
  readonly migration: {
    readonly artifactSha256: Sha256HexV1;
    readonly appliedVersions: readonly NonEmptyTrimmedStringV1[];
  };
  readonly deletionTombstoneUpperBound: NonNegativeSafeIntegerV1;
  readonly accountDeletionLedgerUpperBound: NonNegativeSafeIntegerV1;
  readonly deletionExternalArchiveUpperBound: NonNegativeSafeIntegerV1;
  readonly startedAt: IsoUtcTimestamp;
  readonly completedAt: IsoUtcTimestamp;
  readonly encryptedObjectKey: NonEmptyTrimmedStringV1;
  readonly kmsKeyId: NonEmptyTrimmedStringV1;
  readonly kmsKeyVersion: NonEmptyTrimmedStringV1;
  readonly encryptedSizeBytes: NonNegativeSafeIntegerV1;
  readonly ciphertextSha256: Sha256HexV1;
  readonly retentionExpiresAt: IsoUtcTimestamp;
  readonly rpoHours: PositiveSafeIntegerV1;
  readonly signingKeyId: NonEmptyTrimmedStringV1;
  readonly signatureAlgorithm: 'Ed25519';
  readonly signature: Base64Url64BytesV1;
}

/* account_deletion_ledgerはlearner PII FKから独立したappend-only正本。
 * 同一DBとは別failure domainのappend-only external archiveを必須とし、control-planeは
 * signed ledger entryとexternal tombstoneの両hashを持つexternal receiptを永続化するまでdeletion jobをcompletedにしない。
 * DR coordinatorはbackup上限以後からexternal archiveのtraffic切替直前上限までを先行再適用する。
 * sequence gap、digest/署名不一致、scope未完了、上限退行時はDR昇格をfail-closedにする。
 * DB/Auth/Storageの一時失敗は同じdeletion job/operation IDで再試行し、全scope完了後だけappendする。 */
```

`RestoreDryRunReportV2.activeUnconsumedSelectionBasisIds`はlowercase canonical UUID bytes昇順・重複なしで、dry-run shared user lock下に存在する未consumeかつ未discard basisのexact集合です。配列長は`counts.activeUnconsumedTargetSelectionBases`とexact一致させ、一件以上なら`conflicts`へ各IDの`TARGET_NOT_EMPTY`をexact一件ずつ含めて`canApply=false`とします。`canApply=true`ではこの配列、同count、全conflictが空/0です。clientはIDを暗黙discard予定集合へ変換せず、各IDへ`reasonCode='restore_empty_namespace_cleanup'`の専用commandを明示送信してcanonical ACKを得た後、新しいdry-run/report hashとfresh reauth grantを取得します。

`RestoreSourceIdentityArtifactV2`はserver-side create-onlyで、署名検証済みportable manifest/payloadからowner user ID、actor principal snapshot digest、actor export pseudonym、kind別全portable fact ID、全content ref、session ID、canonical event ID、command ID、consume済みselection basis IDを独立再計算します。主rowはartifact/job/export/source generation/payload hash/artifact hashを物理列へ持ち、各集合はartifact FK、set kind、fact kind nullable、ordinal、strict value/value hashを持つchild rowへ物理化します。strict artifactの集合値・count・set hashの正本はこのchild row集合からだけ導出し、JSONを独立正本にしません。owner、actor principal digest、actor export pseudonym、content/session/event/command/basisは別set kind、principal digestとpseudonymは別型列です。ownerはlowercase UUID bytes、principal digestはhex decode bytes、pseudonymはbase64url decode bytes、各ID集合はlowercase UUID bytes、content refは`(questionId UTF-8 bytes,questionVersionId UUID bytes)`、fact集合はregistry ordinalと各UUID bytesの順でsortし、全配列を重複なしにします。`portableFactIdsByKind`はregistry全kindを0件でもexact summary一行持ち、未知・欠落kindを拒否します。各`count=values.length`、`setHash=SHA-256(JCS(values))`をchild rowsから生成し、dry-run rowのstrict `sourceIdentitySets` JSON/hashへexact一致させます。`actorPrincipalSnapshotDigests`はportable actor mapの`sourcePrincipalSnapshotDigest`、`actorExportPseudonyms`は同mapと全参照factのexact coverageから導出し、raw source principal IDをportable payloadへ追加しません。

`artifactHash=SHA-256(JCS(artifactHashだけを除くstrict artifact))`、`setsHash=SHA-256(JCS(setsHashだけを除くRestoreSourceIdentitySetsV2))`とし、dry-run reportはartifact ID/hash、全summary、sets hashを`reportHash`へ含めます。finalizeはuser exclusive lock取得後に同じsource portable payloadから全集合を再計算し、source export ID/generation/payload hash、保存artifact、dry-run report、fresh reauth grant targetのreport hash、全counts、`activeUnconsumedSelectionBasisIds=[]`を再検証します。一ID/ref/digest/pseudonymの追加・欠落・同数差替え、kind移動、artifact/sets/report hash不一致、target active basis一件以上ではlive row、generation、job phaseを変更しません。selection basis discard request/fact/command receiptはportable payload、全identity集合、restore replay archive、restore materialization linkのいずれにも含めず、一件でも検出したportable inputを`UNSUPPORTED_SOURCE_SCHEMA`で拒否します。

`DeletionRetentionPolicySnapshotV2`は確定済みD03-Aだけを表すaccount-deletion保持正本です。`DeletionPolicyBindingV2`はactivation fact ID/revision、`deletionPolicyEnvironment='production'`、snapshot ID/body/hashの唯一の共通bindingで、challenge、internal deletion job、受付receipt、全status branch、署名済みledger、external tombstone、combined archive receipt、DR manifestへ余剰・欠落なく継承します。policyの有効化は`private.activate_deletion_retention_policy_v2`だけを使い、production environment policy advisory lockをexclusive取得し、immutable snapshot ID/body/hashと`expectedActivationRevision`を検証してappend-only factをexact 1増加で追加します。同environment/revisionとsnapshotは一意、同じoperation ID/hashだけ冪等、旧activation/snapshotのUPDATE/DELETEを禁止します。RPCは`control_plane`専用role、deployment claim/lease/fencing、operation principal snapshotを要求し、PUBLIC/anon/authenticated/service_role/content-controlからREVOKEします。削除challengeは同environment lockをshared取得した後に最大activation revisionのexact一件をpinします。未有効、複数latest、future effective snapshot、environment不一致ではchallengeを発行しません。全段は同じbindingを物理列とstrict DTOへlosslessに継承し、activation fact FK/deferred equalityで結合します。全fieldを署名/hash対象にし、job途中のenvironment、retention、SLO差替えを拒否します。

policy hashはsnapshot全fieldのRFC 8785 JCS SHA-256です。期限は削除受付で固定した`acceptedAt`を起点に、`deletionRetentionExpiresAt = acceptedAt + 30日`、`deletionSloDeadlineAt = acceptedAt + 24時間`のUTC millisecond時刻へ固定します。backup retentionは最大30日、RPO 24時間、RTO 8時間、backup実効消去は削除受付から30日以内です。事故検知時は直ちにincident response/restoreを開始し、事故後30日以内の申告を待つ条件はありません。30日超保持、backup無効branch、数値差替えをstrict schemaとDB CHECKで拒否します。

`DisasterRecoveryPolicySnapshotV2`はD03-A専用の別正本であり、`DeletionRetentionPolicySnapshotV2`を代用しません。`policyHash=SHA-256(JCS(policyHashだけを除くstrict snapshot))`、retention/RPO/RTO/deletion SLOを30/24/8/24へ固定します。DB snapshot rowは全policy fieldを物理列化し、strict policy JSON/hashとexact一致させます。backup operationはproduction environment lockをshared取得し、最新有効DR snapshot ID/body/hashと同時点のdeletion-policy activation fact/revisionを一barrierへpinします。manifest rowはactivation FK/revision、embedded deletion/DR policy、barrier、strict JSON/hashをdeferred exact一致させ、environment、retention/RPO/RTO/deletion SLO、scope、KMS/regionを差し替えられません。tombstone/ledger/combined receiptの連続上限を検証し、全count/size/sequenceをsafe integer、migration versionsをUTF-8 byte昇順・重複なしにします。

worker DB rowの`InternalDataJobStatusV2`とrestore phaseは利用者DTOへ直接露出しません。sanitized mappingは次で固定します。

| internal job status | export/account delete public status | restore public status |
|---|---|---|
| `queued` | `queued` | 現在保存済みphase。未設定時は`uploaded` |
| `running` | `running` | `validating`は`uploaded`、他は同名phase |
| `retry_wait` | `queued` | 最後にcommit済みのpublic phase。retry情報・時刻・回数は非公開 |
| `completed` | `completed` | `applied`だけを許可 |
| `failed` | `failed` | `failed` |
| `dead_lettered` | `failed`かつ`errorCode='DEAD_LETTERED'` | `failed`かつ`errorCode='DEAD_LETTERED'` |

内部`validating`、lease owner、fencing token、retry count、stack、Storage keyを公開DTOへ含めません。status/phaseの不可能な組合せをDB CHECKで拒否し、mappingはSQL/TypeScriptのliteral table goldenで一致させます。

`AccountDeletionLedgerEntryV2`、`ExternalAccountDeletionTombstoneV2`、`AccountDeletionArchiveReceiptV2`、`DisasterRecoveryBackupManifestV2`は、それぞれ`signature`だけを除いた全fieldのRFC 8785 JCS UTF-8 bytesをEd25519で署名します。combined archive receiptは`storageSubjectDigest`値と`externalTombstoneHash`を保持し、Storage digestのalgorithm・key ID/versionはreceiptへ直持ちせず、署名済みtombstoneとそのhashによって拘束します。receiptの`storageSubjectDigest`は署名preimageとreceipt hashの対象であり、同sequence tombstone、DB `account_deletion_archive_receipts.storage_subject_digest`、Storage object keyのowner segment、immutable metadata tupleとbyte-exactに一致しない限りreceiptを確定しません。ledgerは`schemaVersion='account-deletion-ledger-entry.v2'`を物理列と署名preimageへ必須化し、省略または別schemaを拒否します。scopeはliteral `['database','auth','storage']`、migration versionはUTF-8 byte昇順かつ重複なし、inventory/hash fieldはlowercase SHA-256、size/count/sequenceは非負safe integer、日時はUTC millisecond固定です。署名とpublic keyのencoding、key validity判定は§12.1と同じです。4種それぞれにliteral preimage bytes、signature、public key、改ざん失敗を持つ独立golden vectorを用意し、さらにledger entry・同sequence tombstone・両hash・`storageSubjectDigest`を持つcombined archive receipt・DR upper-bound判定を一組にしたgoldenを[受入証跡 v2](./acceptance-evidence-v2.md)のaccount deletion/restore drillへ共通入力します。

external tombstoneの`subjectIssuer`はIdP trust registryでcanonical化したissuer literal、`subject`はIdPが発行したopaque subject literalです。`subjectDigest = HMAC-SHA-256(K_subjectDigestKeyId, UTF8('jstqb-account-deletion-subject-v2') || 0x00 || UTF8(subjectIssuer) || 0x00 || UTF8(subject))`だけを保存します。issuer/subjectはいずれもUnicode正規化、case fold、trimを行わずregistry/IdPのcanonical UTF-8 bytesを使用し、subject raw値はdelete workerのvolatile memory外へ出しません。HMAC keyはprimary DBに保存せずDR control-plane KMSでbackup最大保持期間より長くversion保持し、external archive DTOはkey IDとdigestだけを持ちます。`storageNamespaceRuleVersion='owner-subject-digest.v2'`の`storageSubjectDigest`は`HMAC-SHA-256(K_storageSubjectDigestKeyId, UTF8('jstqb-storage-owner-subject-v2') || 0x00 || UTF8(subjectIssuer) || 0x00 || UTF8(subject))`のlowercase hexです。`storageSubjectDigestAlgorithm='HMAC-SHA-256'`、`storageSubjectDigestKeyId`、`storageSubjectDigest`は署名済みtombstoneとそのpreimageに必須で、`storageSubjectDigestKeyId !== subjectDigestKeyId`をstrict schemaとDB CHECKで強制します。両key IDは別KMS key/versionを解決し、aliasだけ別で同じkey materialを指すことも拒否します。Storage objectはこのdigestとstorage key IDをobject keyのexact一segmentとimmutable metadata tupleの双方へ同値で保存し、削除時とprimary-loss後の再削除で三値をbyte-exact再検証し、両方が一致するobject versionだけを対象にします。combined goldenはtombstoneの署名済みdigest値、object-key segment、immutable metadata、ledger/tombstone両hashの一致と各1-bit不一致拒否を含みます。禁止する「raw UUID」はowner/auth subjectまたはそこから導いたUUID/prefixであり、乱数で独立発行した`deletionJobId`、`operationId`、artifact ID等の非主体識別子はstrict DTOに保持できます。raw owner/auth subject UUID、subject、email、またはそれら由来prefixをbucket key・object key・metadata・archive DTOへ保存せず、digestのprefix/部分一致やkey・metadata片方だけの一致を認めません。

一つの`account_deletion_ledger.sequence`にはexact一件の署名済みledger entryとexact一件の`ExternalAccountDeletionTombstoneV2`だけを対応させ、両者のsequence/job/operation/scope/time、`subjectDigestVersion/subjectIssuer/subjectDigestAlgorithm/subjectDigestKeyId/subjectDigest`、共通deletion policy binding、retention expiry、SLO deadlineをexact一致させます。tombstone固有の`storageNamespaceRuleVersion/storageSubjectDigestAlgorithm/storageSubjectDigestKeyId/storageSubjectDigest`も署名・hashへ拘束します。combined `AccountDeletionArchiveReceiptV2`は同じpolicy binding、tombstoneの`storageSubjectDigest`値、`externalTombstoneHash`を持ち、algorithm・key ID/versionを重複保持しません。`externalTombstoneHash`でそれらのtupleを拘束し、ledger/tombstone、DB列、Storage object keyのowner segment、immutable metadata tupleがbyte-exactに一致する時だけ両hashを結合します。sequenceの再利用、複数tombstoneへのfan-out、値差替えを拒否します。削除完了transactionは両artifactを同じledger sequenceへ結合し、exact一件のcombined receiptが両hash、Storage digest、policy bindingを検証するまでjobをcompletedにしません。primary DBを完全喪失したDRでは、旧backup内のIdP issuer+subject候補とStorage owner metadataごとに署名拘束したsubject/storageの別version keyでdigestを再計算し、一致subjectのDB/Auth/Storageをtraffic開始前に再削除します。digest key欠落、両key同一、未知issuer/rule version、sequence gap、署名/hash/policy binding不一致、scope未完了では昇格をfail-closedにします。

`deletionExternalArchiveUpperBound`はarchive側の独自sequenceではなく、「exact一件のcombined archive receiptでledger entry hashと同sequence tombstone hashの両方を再検証済みである最大contiguous `account_deletion_ledger.sequence`」です。DR manifestのbarrier対象についてreceiptのledger sequenceにgap 0、各`ledgerEntryHash`がprimary ledger、各`externalTombstoneHash`が同sequenceの署名済みexternal tombstone、receiptの`objectSha256`が両artifactを格納するimmutable object bytesと一致し、`deletionExternalArchiveUpperBound >= accountDeletionLedgerUpperBound`を要求します。片方だけのarchive、二receiptの後付け結合、同sequenceの重複receipt、満たさないbackupを昇格しません。`AccountDeletionArchiveReceiptV2.archiveSequence`はarchive監査順であり、このupper boundへ代入しません。

```ts
interface CsvExportManifestV2 {
  readonly schemaVersion: 2;
  readonly exportId: UUID;
  readonly ownerUserId: UUID;
  readonly issuedAt: IsoUtcTimestamp;
  readonly encoding: 'utf-8';
  readonly dialect: 'rfc4180';
  readonly formulaSafety: 'leading-apostrophe-v1';
  readonly restorable: false;
  readonly files: NonEmptyReadonlyArray<{
    readonly fileName: NonEmptyTrimmedStringV1;
    readonly headers: NonEmptyReadonlyArray<NonEmptyTrimmedStringV1>;
    readonly rowCount: number;
    readonly sha256: Sha256HexV1;
  }>;
}
```

```text
POST /v2/reauth-grants
```

endpointはactive JWTだけでなくidentity provider credentialを再検証し、5分TTLのopaque `grantToken`を一度だけ返します。DBにはtoken本体でなくSHA-256 hashだけを保存します。targetはpurpose別strict unionをRFC 8785 JCS化した`targetHash`へ結合し、exportはformat、restore enqueueはupload ID・object SHA-256・export ID、restore confirmはjob ID・dry-run report hash、deleteはchallenge ID、contentはbundle/raw/canonical/manifest hashとactor roleを拘束します。

requestは`ReauthGrantRequestV2`のstrict unionです。P0はemail/password accountの現在password再提示だけを許可し、TLS経由のisolated workerだけがIdPへ再提示して即時破棄し、log/DBへ保存しません。OIDC再認証はserver保存challenge、PKCE/state/nonce、same-subject検証を別ADRで確定するP1まで無効です。active JWTだけ、端末内の古い`reauthenticated_at`、client自己申告時刻は証明に使用しません。

CSVはprofile allowlist settings、session、attempt、bookmark、note、本人issue、学習projectionの閲覧用だけを固定file/header allowlistで出力し、正答、解説、token、email、他利用者IDを含めません。UTF-8、RFC 4180とし、全cellをstring化します。元cell先頭が`= + - @`、tab、CR、LFのいずれかならapostropheを付けてからquoteし、nullは空、timestampはUTC millisecond形式です。ZIP内file名へpath separatorを許可しません。CSV/ZIPはrestore入力として必ず拒否し、formula/quote/CRLF/UTF-8 fixtureでbytes hashまで照合します。

```sql
public.enqueue_user_export_v2(
  p_format text,
  p_reauth_grant_token text
) returns jsonb
public.initialize_user_restore_upload_v2(
  p_object_sha256 text,
  p_size_bytes bigint
) returns jsonb
public.enqueue_user_restore_v2(
  p_reauth_grant_token text,
  p_restore_upload_id uuid
) returns jsonb
public.confirm_user_restore_v2(
  p_restore_job_id uuid,
  p_dry_run_report_hash text,
  p_reauth_grant_token text
) returns jsonb
private.activate_deletion_retention_policy_v2(p_request jsonb) returns jsonb
public.issue_account_deletion_challenge_v2() returns jsonb
public.enqueue_account_deletion_v2(
  p_reauth_grant_token text,
  p_challenge_id uuid,
  p_challenge_response text
) returns jsonb
public.get_own_data_job_v2(p_job_id uuid) returns jsonb
```

```text
POST /v2/account-deletion-receipt-status
Authorization: Receipt <receiptToken>
```

削除受付時に返したreceipt tokenだけを使うAuth非依存endpointです。tokenは24時間TTL、job IDへ結合した256-bit random capabilityで、DBにはSHA-256 hashだけを保存します。期限内はpending確認のため複数pollを許可しますが、IP/token単位rate limitと指数backoff hintを適用し、完了receipt取得または期限到達後にrevokedへします。request bodyやURLへjob ID/object keyを持たせず、tokenから一意jobを解決して`AccountDeletionReceiptStatusV2`だけを返します。PII、内部Storage key、署名原文、他jobの存在は返しません。別job token差替え、期限切れ、revoked token、hash不一致、rate limit超過を一定時間の同一応答で拒否します。

user IDは全入力から除外し認証主体をownerへ固定します。P0 restore uploadは独自暗号envelopeを使わないserver-signed portable JSONで、TLS、非公開Storage、provider at-rest encryptionを境界とします。downloadしたexportの保管責任をUIへ明示します。upload初期化はactive JWT、本人領域、件数・容量rate limitだけを検証し、live dataを変更しないcreate-only一時objectを作ります。restore enqueueとconfirmはそれぞれ別に取得したfresh one-time grantを要求し、同じgrantを2回使用しません。grant消費を伴う各transactionでDB `clock_timestamp()`、owner、purpose、target hash、expiry、未使用を検証して`used_at`を確定し、expired、replay、対象差替えを拒否します。restore objectは固定private bucket内でserver発行`uploadId`からDB保存済みbucket/keyを組み立て、client URLをfetchしません。upload初期化時点ではobject version/etagを返さず、owner/object key/max size/content type/expected object SHA-256を固定します。upload後にworkerがHEADとbyte stream SHA-256でactual version/etag/size/content type/hashを原子的に固定し、dry-run/apply直前にも同一性を再検証します。JSON内部のEd25519 manifest署名とpayload hashは別に検証します。未使用・失敗・期限切れuploadは24時間以内にworkerが削除します。状態は`uploaded -> validated -> dry_run_ready -> applying -> applied`で、dry-run report hashとfresh one-time restore-confirm grantを伴う明示confirmだけがapplyへ進めます。account deletionは期限付きchallengeのexact responseとfresh grantを要求し、session revoke前に`AccountDeletionReceiptV2`を返します。削除後はreceipt capability endpointだけがstatus/receiptを返します。公開errorは`REAUTH_REQUIRED`、`REAUTH_EXPIRED`、`REAUTH_ALREADY_USED`、`JOB_CONFLICT`、`RESTORE_MANIFEST_INVALID`、`RESTORE_TARGET_NOT_EMPTY`です。内部`claim/complete/fail` RPCは専用`control_plane` DB roleだけ、exam finalize claimは`exam_finalizer` roleだけへgrantし、PUBLIC/anon/authenticated/service_roleからREVOKEします。Auth Admin credentialとDB `control_plane` credentialを分離し、利用者は本人限定sanitized job-status RPCだけを呼べます。

## 15. Migration互換表

| DB状態 | 旧client 5 kind | 新client public 9 kind | personal preview sync | control plane | content release | catalog/feedback |
|---|---:|---:|---:|---:|---:|---:|
| initialのみ | 対応 | 非対応 | 非対応 | 非対応 | 非対応 | 非対応 |
| initial＋M1 | 対応 | 非対応 | 非対応 | 非対応 | 非対応 | 非対応 |
| initial＋M1＋M2 | 対応 | 対応 | `FEATURE_NOT_AVAILABLE` | 非対応 | 非対応 | 非対応 |
| initial＋M1～M3 | 対応 | 対応 | `FEATURE_NOT_AVAILABLE` | reauth/finalizer基盤 | 非対応 | 非対応 |
| initial＋M1～M4 | 対応 | 対応 | backend契約のみ・`FEATURE_NOT_AVAILABLE` | reauth/finalizer基盤のみ | 対応 | 非対応 |
| initial＋M1～M5 | 対応 | 対応 | 対応 | reauth/finalizer基盤のみ | 対応 | 対応 |
| initial＋M1～M6 | 対応 | 対応 | 対応 | export/delete対応、restoreは`FEATURE_NOT_AVAILABLE` | 対応 | 対応 |
| legacy bridge cutover後 | 非対応 | 対応 | 対応 | restoreを含め対応 | 対応 | 対応 |

legacy対象はsession.created、draft.saved、answer.submitted、session.advanced、bookmark.changedです。新規RPC行へlegacy fingerprint fallbackを適用しません。

M4のpersonal previewはacceptance/stage・DB保存・worker契約だけを展開するbackend-only期間です。M5 safe catalog/owned-session/feedback grant、署名済みruntime capability、対応clientのproduction照合がすべて完了するまでpersonal preview sync・UIはOFFで、M4 schema存在だけで有効化しません。

`contractVersion`欠落remote canonical rowはv1 read adapterだけで扱います。v1 schemaは旧5 kindに加え、過去に保存されたrandom/practice `session.submitted`の完了snapshotを許可しますが、local materializationだけを行い、push、ACK生成、server mutation、新outbox化を禁止します。欠落versionのlocal pushは`INVALID_ENVELOPE`です。

## 16. Request hash Golden Vector

RFC 8785 JCSでcanonical化したUTF-8 bytesのSHA-256 lowercase hexとします。

入力:

```json
{
  "contractVersion": 2,
  "dataGeneration": 1,
  "eventId": "22222222-2222-4222-8222-222222222222",
  "kind": "draft.saved",
  "entityId": "33333333-3333-4333-8333-333333333333:fl-001",
  "occurredAt": "2026-08-13T00:00:00.000Z",
  "payload": {
    "sessionId": "33333333-3333-4333-8333-333333333333",
    "questionId": "fl-001",
    "selectedChoiceIds": ["fl-001-D"],
    "scrollOffset": 0,
    "expectedRevision": 0,
    "deviceId": "golden-device"
  }
}
```

JCS:

```text
{"contractVersion":2,"dataGeneration":1,"entityId":"33333333-3333-4333-8333-333333333333:fl-001","eventId":"22222222-2222-4222-8222-222222222222","kind":"draft.saved","occurredAt":"2026-08-13T00:00:00.000Z","payload":{"deviceId":"golden-device","expectedRevision":0,"questionId":"fl-001","scrollOffset":0,"selectedChoiceIds":["fl-001-D"],"sessionId":"33333333-3333-4333-8333-333333333333"}}
```

期待SHA-256:

```text
3a3545cac860482664129c28fde209a9eb046cb523b1fe248cb79a7f60a4c079
```

TypeScriptとPostgreSQLがこの固定値へ独立に一致することを試験します。expectedを実装関数自身で生成する自己証明は禁止します。

## 17. 契約完了条件

- TypeScript schemaとSQL contract testが本書へ一致する。
- 既存testを変更しない。
- 9 kindの正常・不足・未知key・cross-state試験がある。
- golden hashがTS/SQLで一致する。
- legacy互換がv2 fingerprintを弱めない。
- 回答前経路に正答・解説がない。
- DBがowner、pin版、期限、choice、revisionをclientに依存せず検証する。
- fresh、upgrade正常、upgrade異常、combinedの実DB証拠が揃うまでmergeしない。
