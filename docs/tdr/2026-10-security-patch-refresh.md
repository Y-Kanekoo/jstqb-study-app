# 2026-10-29 SDK 57 依存パッチ再評価

対象は Draft #39 の依存グラフ。SDK/RN の組合せ、既存 override、query-string adapter は変更しない。

| 経路 | 変更 | 理由 |
| --- | --- | --- |
| Expo CLI / code-signing-certificates → node-forge | 1.4.0 → 1.4.2 | 公式 npm の同一 minor パッチ。1.4.2 の RSA 実装は DigestInfo を DER 再符号化して比較し、余剰の内側要素を拒否する。合成署名で正常検証と余剰要素の拒否を実行する。 |
| アプリ / eslint-config-expo → Zod | 4.6.5 → 4.6.7 | 同一 minor パッチ。後述の Expo CLI 内 Zod 3 は別経路。 |

2026-10-29 の未抑制 `pnpm audit --audit-level high` は、変更前 high 3 / moderate 6 / low 2、変更後 high 2 / moderate 6 / low 2。**security gate は失敗のまま**。残る high は、Vitest が使う Vite 8.2.1 の [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) と、Expo CLI が使う `zod@3.25.76` の [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。Vite 8.2.4 は Rolldown 1.2.15 と `@oxc-project/types` 0.155.0 を引き込み、後者は現在の 0.143.0 から minor 更新になる。Zod の監査上の修正版は 4.6.6 以上で、Zod 3→4 は major と Expo CLI consumer の契約確認が必要。両経路は今回のパッチに含めない。braces の [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) は 2026-10-23 に撤回された。依存を改変せず、撤回と修正を区別する。

node-forge の [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) の Web 表示は 2026-10-29 時点でも patched `None` のままだが、監査 API は `>=1.4.1` と報告する。公式 [v1.4.2 release](https://github.com/digitalbazaar/forge/releases/tag/v1.4.2) の配布物と 1.4.0 の `lib/rsa.js` 差分、合成不正署名の回帰結果を優先して変更を限定した。同じ不正 DigestInfo は 1.4.0 で検証成功し、1.4.2 では拒否された。単に監査表示が消えたことだけを修正証拠にしない。

最終差分の frozen install は供給網874件成功。`pnpm check` はno-any、秘密検査、例外検査、lint、型、単体14件、operations92件、Web build成功。システム Chromium による通常 Web と Pages サブパスの E2E は desktop/mobile 各9件、各計18件成功。ローカル E2E では記録用 ffmpeg がないため一時設定で動画のみ無効にし、既存テストと期待値は変更していない。Pages は成果物検証であり公開は行っていない。

ローカルDBの5段階harnessはfresh段階で未完了。Supabase CLI 2.113.0とDocker daemonを確認して起動したが、`public.ecr.aws/v2/`が`Forbidden`で、続くイメージlayer登録は`no space left on device`になった。harness終了後の所有container/volumeは0。今回新規取得した未使用Docker imageを回収した。DB受入成功とは扱わず、許可済みregistryと十分なディスクを持つCIで最終headの再実行が必要。

既存 test 入力・期待値、監査重大度、例外は変更しない。native 署名・実機・本番サービスは未検証。マージや配備の根拠にはしない。
