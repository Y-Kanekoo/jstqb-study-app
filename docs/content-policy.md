# 問題コンテンツ方針

## 1. 500題の定義

D-04でownerが`allocationVersion:1`を承認した後、初期運用の「500題」はowner限定personal previewで使用する、独立・レビュー済みの問題exact 500題を意味します。初期phaseはpersonal-onlyとし、同じ承認済みallocationのexact 500題を`reviewing`のまま使用してpublishedとは数えません。一般公開gateは将来phaseとして維持し、全追加reviewとattestationが揃った時だけ現在有効な`published` exact 500題へ昇格します。D-04未決定の間は本章の数値を作問計画として扱い、personal preview activation、public manifest作成、公開を行いません。下書き、廃止、単純な選択肢入替、`compatibility_only`は500題へ数えません。将来増加は別allocation versionで設計・承認し、未review問題を加えて件数表示だけを500超にしません。

## 2. 配分

| 章 | allocationVersion:1承認後のexact quota |
|---|---:|
| 第1章 テストの基礎 | 100 |
| 第2章 SDLC全体を通じたテスト | 75 |
| 第3章 静的テスト | 50 |
| 第4章 テスト分析と設計 | 138 |
| 第5章 テスト活動のマネジメント | 112 |
| 第6章 テストツール | 25 |
| 合計 | 500 |

根拠は、JSTQB Foundation Level Version 2023V4.0.J02に対応する公式`ISTQB Exam Structure Tables v1.18`の40問章別内訳`8 / 6 / 4 / 11 / 9 / 2`です。`rawQuota = 500 * officialChapterQuestionCount / 40`は`100 / 75 / 50 / 137.5 / 112.5 / 25`となります。各値をfloorした499題へ最大の小数剰余から1題を加え、小数剰余が同率の第4章・第5章は章番号昇順をtie-breakとして第4章を選ぶため、現配分になります。公式K別`8 / 24 / 8`は端数なく`100 / 300 / 100`です。一次情報証跡は`content-blueprint-v1.md`のstrict `OfficialSourceVerificationEvidenceV1`、`OfficialSourceRequirementRegistryV1`、`OfficialSourceVerificationCoverageV1`だけを正本とします。release runnerはJSTQB syllabus、JSTQB guidance、ISTQB Exam Structure Tablesの必須3 sourceをcontrolled downloadし、各sourceのevidence ID、URL、exact version、`retrievedAt`、取得bytesのSHA-256、`verificationResult='verified'`、runner ID/version、artifact hashを固定します。具体的なdigestは事前に推測しません。registryの全source/claimをexact被覆し、evidenceのcanonical bytes/hashをcoverageへlosslessに結合します。`ContentOfficialExamStructureBasisV1`のsource version/hash/time/evidence ID/hashはExam Structure Tables evidence refへexact一致させ、basis既定fieldの式・小数同率規則とともに`officialExamStructureBasisHash`へ固定し、basis全体とhashをallocation hashへlosslessに含めます。personal/public manifest branchとacceptance evidenceは同じ`officialSourceVerificationCoverageHash`を必須参照します。source/evidence/claimの欠落、verified以外、取得bytesとのdigest不一致、URL/ID swap、coverage/basis不一致ではallocation生成、stage、acceptance/public release、40問・60分・26点基準のactivationを全拒否します。公式構成が変われば既存versionを上書きせず、新しいevidence、coverage、basis、allocation versionを作ります。single/multiple 440/60は公式章比率ではなく、本アプリの学習設計上の決定です。

初期本番は品質gateを完了できるexact 500を優先します。比較対象アプリの現行・同一資格・同一syllabus・同一課金範囲の問題数`C`が一次情報で500超と確認された場合だけ、次versionの目標を`40 * ceil(C / 40)`題として公式40問比率を整数倍で保ちます。現行件数が非公開なら「独自500題」とだけ表示し、「同数以上」と断定しません。追加分にも同じG0〜G12、owner全件review、将来public gateを適用します。

Kレベルはowner承認後、K1 100題、K2 300題、K3 100題のexact quotaです。64の学習目標別quota、single 440 / multiple 60、multiple章12 / 9 / 6 / 17 / 13 / 3、multiple K 6 / 39 / 15、multiple全60題の必要選択数2も同じ`allocationVersion:1`へ固定します。模試1回ごとのsingle/multiple比率は固定せず、章・K配分だけをexact充足します。

模試selectionの母集団はscopeごとに分離します。`personal-preview`は認証ownerのactive personal acceptance manifestへpinされた`examEligibility='eligible'`かつ`reviewing`のcurrent versionsだけ、`published`はcurrent published catalogの`examEligibility='eligible'` versionsだけです。各scope内で章`8 / 6 / 4 / 11 / 9 / 2`、K`8 / 24 / 8`を同時にexact充足し、同一問題stable ID・versionの重複を0とし、全itemのeligibility、manifest/catalog revision、acceptance ID/hashをselection basisへ固定します。別scope、別acceptance、非eligible、acceptance manifest外、reviewingとpublishedの交差混入は開始transactionで拒否します。

Kレベルは問題データの自己申告値ではなく、ISTQB CTFL Syllabus v4.0.1の64 LO対応（K1 14 LO、K2 42 LO、K3 8 LO）から検証器が導出します。規範対応表は`detailed-design-v2.md` §14.1、作問単位の認知操作・pattern family・strict schemaは`content-blueprint-v1.md`へ一元化し、LO codeと申告Kレベルが不一致なら公開を拒否します。

## 3. 必須情報

- 問題ID、問題版ID、版番号
- シラバス版、章、節、学習目標、Kレベル
- 難易度
- 単一／複数選択、必要選択数
- 問題文、選択肢、正答
- 総合解説、全選択肢の理由、takeaway、common trap
- 根拠資料と該当箇所
- シャッフル可否
- 作成者、レビュー者、レビュー日時
- 状態、公開日時、訂正理由
- 重複検査情報

private canonical projectionは正答choice stable ID集合を必須fieldとし、required countとexact一致させます。`isCorrect`、`is_correct`等の正答booleanはprivate source、import DTO、DBのrelease candidate行、canonical projectionへauthorable fieldとして持たせず、正答集合所属から導出します。全choiceの`relevantClaimKeys`、questionの`takeaway`と`commonTrap`も学習上の意味fieldとしてDB/API canonicalと`contentHash`へlosslessに含めます。正答、`relevantClaimKeys`、takeaway、common trapのいずれかだけの変更でもcontent/canonical/personal・public manifest hashが変わり、旧acceptance/attestationを再利用できません。正答集合はsanitized reportへ出しません。初回500問の`release_candidate`はchoice 4〜8件とし、既存互換問題は`compatibility_only`の別schema・別経路へ隔離してpersonal/public catalog、模試、500 countへ混入させません。

## 4. 作問規則

- テス友、市販教材、模擬試験を複製・言い換えしません。
- 根拠資料から独自の状況と問いを作ります。
- 正答数と必要選択数を一致させます。
- 全誤答選択肢に妥当な誤り理由を用意します。
- 文法・長さだけで正答を推測できる手掛かりを避けます。
- 不要な否定形、ひっかけ、「すべて正しい」を避けます。
- シラバス本文を不必要に長く転載しません。
- 類似・重複・表記ゆれを自動検査します。
- AI出力を自動公開しません。
- 正答は`correctChoiceStableIds`だけを正本とし、choice側に独立した正答booleanを持たせず、authorable入力としても受理しません。
- asked claim、premise、fact/artifact、reasoning step、choiceのaddressed/relevant claimをstructured keyで参照し、全fact/artifact kindがLO blueprintのpermitted list、required evidence kindがrequired listに所属することを検査します。K1はrequired件数0とcontext用permitted kindを分離し、欠落・余剰・循環・無関係正答を公開前に拒否します。
- reasoning step番号は正のsafe integer、重複なし、exact `1..N`とし、canonicalizationは数値昇順で行います。
- reasoning stepは1〜12件です。0件、13件、欠番、重複をprivate/API/DBの共通生成schemaで拒否します。
- takeaway/common trapは回答確定後feedbackだけで配信・cacheし、回答前catalog、selection basis、draft、問題表示DTO、模試提出前response、suspended/revoked tombstoneへ含めません。単独または組合せで正答choice、正答数、正答位置、計算結果を推測できる表現をchoice cue gateとhuman reviewで拒否します。
- 数値問題は固定formula registryと独立oracle runnerでclaim単位に全件再計算します。registryはformula ID/unit variantごとにinput key、kind、unit、integer/sign/zero domain、cross constraint、丸めmode/scale、result unitをliteral固定します。verification artifactは`content-blueprint-v1.md`の生成型をlosslessに使い、content ref＋claim keyをunique/sortし、formula ID/unit variant、scalar/rational/rational-list inputs、中間値、丸めmode/scale、scalar/ordered-set expected/oracle値、unit、全choice bindingを保持してartifact hashをmanifestへ結合します。calculation claimを`relevantClaimKeys`で参照するchoice集合とbinding集合をexact一致させ、key/kind/unit/domain/variantの不正組合せ、claim欠落、ordered-setのscalar化、binding欠落・余剰を拒否します。
- provenanceはblueprintのstrict generated typeだけを使用し、non-empty source/model run、SHA-256、正のgrapheme数をAPI/DBでwideningしません。
- 全500問に署名・audience・期限を検証したrecent-auth済みhuman principal、assertion artifact hash、artifact hashを除いたprivate subject hash、content refを結合したpre-freeze accountability artifactをexact一対一で要求します。identity assertionの署名対象へ`questionStableId`、`versionStableKey`、`subjectHash`、`statementVersion`、`statementHash`を含め、statement literal registry/digestへ一致させます。asserted/artifact/subject principalの不一致、A/B問題のswap、同一artifactの別問題再利用、bundle自己申告principal、内容またはstatement変更後の旧artifactを拒否します。nonceとtrust public keyは32 bytes、Ed25519 signatureは64 bytesのbase64url no-paddingを必須とします。この署名はcontrolled service assertionであり、自然人の秘密鍵による否認防止署名とは表示しません。
- copyright比較は、許諾・公開範囲内corpusのID/digest/scope/as-of/license review artifactを事前freezeしたregistryだけを使用します。registry digestは`registryDigest`自身を除く`{schemaVersion,registryId,asOf,entries}`のRFC 8785 JCSから計算し、entriesをcorpus IDのUTF-8 byte昇順へ固定します。corpus別一致件数0とdetected source FKをmanifestへ拘束し、「固定corpusとの一致0」と独立human reviewを証拠にします。世界中の全問題との一致0とは表現しません。
- personal previewのK1/K2 human reviewは、canonical/blueprint/allocation/quality-gateと候補stratumをfreeze後、controlled serviceが同じ`samplingFreezeHash`へ一回だけ発行するCSPRNG 32 bytes seedを使います。署名済みappend-only sampling artifactへ`canonicalHash`、`blueprintHash`、`allocationHash`、`qualityGateConfigHash`、`samplingFreezeHash`、seed、全population/rank、stratum、cutoff、必須選択理由、最終集合をlosslessに結合し、同一freezeへの再発行、content hash由来seed、seed候補選別を禁止します。domain separatorは`UTF8("literal") || 0x00 || JCS(...)`のbyte列で表し、NULエスケープ文字列表記やdelimiter連結を代替にしません。chapter/K/selectionの各stratumをdomain-separated RFC 8785 JCS rank順でceil 20%抽出し、全K3・全multiple・全blind disagreement・carry-forwardとの集合和を取ります。任意抽出と端数切捨てを禁止します。
- official source、allocation、blueprint、quality gate、corpus、review、oracle、provenance/accountability coverageの補助hashは`content-blueprint-v1.md` §3.2.1だけを唯一の正本とします。API/DB上の同名型・表・式はblueprintの生成schemaによる表示用契約であり、別正本にしません。各実装はliteral JCS bytes/UTF-8 hex/SHA-256 golden、自己hash除外、配列swap、1 bit変更、Unicode差、未知field、重複refを独立検証します。accountabilityは`subjectHash`を対象とし、canonical `contentHash`と同一視せず、`statementHash=SHA-256(UTF8(statementLiteral))`へ固定します。
- quality gate設定の型名はliteral `ContentQualityGateConfigV1`、schema literalは`content-quality-gate.v1`だけです。quality gate、review、provenanceで使うtokenizer/model/corpus/formula/runnerの全digest/hashはlowercase SHA-256、全ID、provider、model ID、run IDはtrim後non-emptyです。空文字、空白、placeholder、uppercase/non-hex/非64文字digestをstrict schema、DB gate、独立runnerの全経路で拒否します。
- review subject、`ContentReviewArtifactV2`、review/identity/accountability/provenance coverageは`content-blueprint-v1.md`のstrict生成型だけを使用します。全review branchへcanonical/blueprint/allocation/quality gate/review policy/evidence hashを要求し、machineはfull report、blind solveは正答非開示packet・提出choice/rationale・提出後の正答開示・完全一致、human系はversion付きchecklist/result evidenceをexact照合します。V1 artifactだけではmanifest/stage/accept/publishを拒否します。review artifactの識別子は`artifactHash`だけとし、存在しない`reviewArtifactHash`や`artifactId`を追加しません。personal/public manifestは各phaseの4 review/provenance系coverage hashに加えて`officialSourceVerificationCoverageHash`とcanonical artifactをlosslessに結合し、欠落・余剰・重複・open/investigating issue・空/空白/numeric artifact entries空を拒否します。
- personal/public manifest branch自体にself hash fieldを持たせません。branchのstrict全fieldをJCS化したSHA-256だけを別objectの`ReleaseHashSetV2.manifestHash`へ保存し、branch内`manifestHash`、personal/public/stage別hash alias、未知fieldをstrict parseで拒否します。branchから除外するfieldはありません。
- 全500問を一問ずつG0〜G12でAI reviewします。G0 schema/canonical、G1設問成立、G2独立blind solve、G3問い・正答・根拠の直接対応、G4 multiple集合全単射、G5誤答魅力度と曖昧性反証、G6断定語・長さ・文体・日本語手掛かり、G7難易度・K・LO、G8数値oracle、G9重複・意味類似、G10著作権・provenance、G11 Web/iOS/Android表示・A11y、G12独立adjudicationです。各問題に生成artifact exact一件、13 pass artifact exact一件ずつを要求し、allowed N/A以外の未達を差戻します。生成run、blind run、adjudication runを相互分離し、G12はhard failを上書きしません。
- `ContentAiReviewCoverageV1`は問題ref exact 500、generation artifact exact 500、問題×G0〜G12 exact 6,500、stale/duplicate/missing/unresolved exact 0を証明します。本文、正答、根拠、hash対象fieldまたはreview policyを修正した問題はG0から全失効・全再実行し、一部passの流用を禁止します。
- ownerは隔離review UIで全500問を一問ずつ確認し、blueprint生成型`ContentOwnerPersonalReviewArtifactV1`をexact 500件作ります。runtime stateは`blind -> blind_submitted -> revealed -> hidden -> audit_completed`だけです。各問は正答、総合解説、全choice解説、takeaway、common trapを含まないblind表示から始め、回答・根拠のimmutable提出後だけ同じ一問をrevealし、一度hideしてauditを完了します。各遷移後の通信断は正答非開示resumeのstate/revision/直前fact hashから再開し、blueprintの4段階artifactへ決定的に集約します。decisionは`pass | changes_required`です。後者はcategoryと理由を必須とし、decision transactionでserver生成issueとreceiptを原子的に作ります。任意issue ID・別問題issue流用を拒否します。personal acceptanceには全500件`pass`とchanges_required issue 0を要求します。bulk pass、未閲覧問題の自動pass、AIによるowner代行は禁止します。従来のK3全件・multiple全件・不一致全件・K1/K2層化20%以上の独立人手reviewも別防御として残します。
- generation exact 500、G0〜G12 exact 6,500、AI coverage、owner review/coverageのstrict型・hash・canonical順は`content-blueprint-v1.md`だけを正本とします。API/DB/validatorは同じ生成型を使い、private→API→DB→API→独立canonicalizerの全fieldをlosslessにround-tripします。
- embedding類似度はpersonal preview/publicとも`8200` basis points以上を無条件に差戻します。例外承認、reviewer override、異なる推論軸を理由にした通過経路は設けず、`embeddingRejectBasisPoints=embeddingReviewBasisPoints=8200`をquality gate hashへ固定します。

根拠はJSTQB公式のFoundation Level Version 2023V4.0.J02と用語集を中心にします。シラバスの利用条件・翻訳著作権表示を尊重し、章節/LOを出典として記録しても、本文の不必要な転載や公式認定を想起させる表示をしません。アプリは非公式・非公認であることを常時明示します。規範source URLは<https://www.jstqb.jp/syllabus/>です。

## 5. 公開フロー

```text
draft
  → schema・自動検査
  → canonical/blueprint/allocation/quality gateをfreeze
  → blind solve
  → AI G0〜G12 exact全件review・coverage固定
  → personal preview最低human review
  → owner全500問のblind提出・reveal/hide/audit・個別decision pass
  → immutable personal manifest
  → reviewing stage・DB canonical/manifest一致
  → owner acceptance・activate
  → モバイル/Webプレビュー
  → 修正時は新版・新bundleで再実施
  → 一般公開用技術・編集全件レビュー
  → immutable public manifest
  → public manifest stage
  → reviewingのまま4人attestation完了（derived gate）
  → published
  → revised / suspended / retired
```

`reviewed`はDB statusとして追加せず、必要review/attestationが完了したderived gateです。問題版はpublish transactionまで`reviewing`を維持します。本人の最終承認を公開条件にします。

初期の運用対象はowner本人だけです。personal acceptanceにはAI coverage exact、独立human review coverage、owner artifact exact 500かつdecision全件`pass`、changes_required/open/investigating issue 0を必須とします。一般公開用のtechnical/editorial/mobile全件reviewと4人attestationは削除せず、将来phaseのpublish gateとして未充足のまま保持します。

stage、personal acceptance、activate、revoke、attest、attestation revoke、publish、suspend、retireは各々別のstrict operationです。生成request/response DTOは未知・欠落・余剰fieldを拒否し、trim後non-empty operation ID、全入力hash、actor/role snapshot、server時刻、結果statusとaudit fact IDをstrict operation receiptへ保存します。同じoperation ID・同じ入力は初回のcanonical response/receiptへ収束し、同じID・異なる入力は拒否します。管理UIはinternal RPCを直接呼びません。personal acceptance、activate、revoke、attest、attestation revokeだけがauthenticated callerのrecent-auth assertion/nonceを最初の成功操作で一回consumeし、再送は保存済みresponseを返すため再consumeしません。suspend/retireはrecent-auth済みauthenticated enqueue request/receiptを作り、保存済みprincipal snapshot、claim、lease、fencing tokenへ拘束されたworkerだけがinternal operationを実行します。human enqueue receiptのprincipal/request/response hashとinternal operation receiptのprincipal/logical request/response hashは別field・別preimage・別operation IDへ保存し、human response hashをinternal response hashとして、またはinternal principalをhuman actorとして流用しません。human enqueueのresponse hash（API `operationResponseHash`、DB `human_response_hash`）はstrict `EnqueueQuestionLifecycleOperationResponseV2`から`operationResponseHash`だけを除いたRFC 8785 JCS bytesのSHA-256です。保存`human_response_json`はhash fieldを含むstrict response全fieldを持ち、その`operationResponseHash`、`human_response_hash`列、再計算値をexact一致させます。hash自身をpreimageへ含める、JSON/列/responseの一field差、1-bit変更、必須field欠落を拒否します。internal responseの`resolvedReauthGrantId`は常に`null`です。stage/publishはmanagement UI経由ではなくcontrol planeが実行し、internal operation自体はrecent-authをconsumeしません。期限切れ、別purpose/audience、別principal、replayは各入口でfail closedです。publishはcommit直前にacceptance/attestation/revoke/current hashを再検証し、競合revoke時はpublished/current/audit/catalogを一件も増やしません。

runtime control `cryptographicReleaseAttestationRequired`はstrict booleanです。missing、null、non-booleanではrelease featureをOFFへ収束させ、falseへdefaultせず、personal/privateを含むaccept、attest、stage、publishを全拒否します。literal falseかつ暗号feature OFFの時だけP0 recent-authを許可し、literal trueでfeature OFFまたは依存不足なら同じ4操作を全拒否します。literal trueかつP1のcredential lifecycle・署名envelope・rotation/revocation・migration/client/goldenが完備した時だけ暗号経路を許可します。いずれの分岐でもglobal suspended statusのDB拒否と配備済み緊急suspend開始RPCを維持します。

suspendだけがsession、selection basis、feedbackを失効させるtombstoneとuser fanoutを行います。suspend targetはversion lock下の`frozenAt`で固定し、`sourceCommittedAt <= frozenAt`を満たす進行中pin itemに加えて、有効かつ`graded`のattempt、各模試のlatest effective result revision、各offline参考模試のlatest effective result/feedback pairだけを含めます。後続result revisionの`sourceCommittedAt`正本は同rowのimmutable `revised_at`です。過去revision、訂正・無効化済みattempt、`not_graded`、latestでない結果、片方しかないoffline pair、境界後の到着を除外します。immutable target memberごとにoperation ID、target member ID、生成fact/revision ID、target payload/result hashを一つのappend-only materialization linkへ結合し、user receiptのmember set hashとglobal target set hashが全linkを重複・欠落なくexact被覆するまでcompletedへしません。

retireはstatus/revision更新、対象catalog streamのmembership removalを表す`CatalogTombstoneDto(reason='retired')` exact一件、append-only audit fact、strict operation receiptだけをatomicに確定します。DB change、RPC response、catalog deltaのreason literalはすべて`retired`であり、`question_retired`等のaliasや変換層を許しません。session、selection basis、feedbackを失効させるtombstone、target snapshot、user fanout、materialization linkはすべて0件です。retire前から存在するsession/selection basisのpinと、その本文・回答・feedbackは維持し、開始時版で再開できます。後からsuspendへ遷移した場合だけ、上記suspend契約で本文・choices・feedbackを失効させます。

全release operationは必須check `database`のliteral 5 phase、すなわち(1)`fresh`: 空DBへの全migration＋全pgTAP、(2)`origin-main-upgrade`: `origin/main`-shaped fixtureからの通常upgrade、(3)`combined-order`: fresh/upgrade両経路のmigration順序・最終schema/RPC署名一致、(4)`atomic-failure`: 途中失敗注入時の完全rollback、(5)`production-boundary`: synthetic fixtureのproduction migration/seed/bundle/artifact混入0、が同一exact headで成功した証拠へ拘束します。一phaseでも欠落、別名、別head、残留DDL/data/history、RLS/ACL不一致、fixture canary検出があればstageを含む管理操作をfail closedにします。

review issueは`open -> investigating|resolved|rejected`または`investigating -> resolved|rejected`だけを許可し、`resolved/rejected`をterminalとします。差戻しで再検討する場合は新issueを作り、既存issueを巻き戻しません。各遷移はreason、server-side actor snapshot、server時刻、prior fact IDを持つappend-only `issue.updated` factを生成し、未許可遷移・他user操作・actor自己申告・reason空白を拒否します。open/investigating issueが一件でもあるcontent refはaccept/stage/publishできません。

## 6. 改訂

| 改訂 | 履歴・学習状態 |
|---|---|
| 誤字・表記 | 継承 |
| 解説補足 | 継承 |
| 意味・選択肢・正答 | 旧履歴を保持し、新版を要再確認 |
| 無効化 | 履歴保持、集計から除外 |
| 廃止 | 新規出題せず履歴で閲覧可能 |

正答誤りなどは緊急停止し、新規出題と採点を止めます。

## 7. 公開リポジトリ

本番500題は公開GitHubへ含めません。公開するのはschema、検証ツール、少数のサンプル問題です。コードのMIT Licenseを問題データへ適用しません。
