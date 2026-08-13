# DB upgrade harness fixture

このディレクトリは完全syntheticなDB検証データだけを置くtest専用境界です。

- `origin-main-shape.sql`: `origin/main`適用後へ投入し、後続migrationで既存データが保持されることを検証します。
- `atomic-failure.sql`: 意図的な失敗を発生させ、DDL・data・migration historyが残らないことを検証します。
- `production-boundary-canaries.json`: production migration、seed、bundle、artifactへの混入を拒否する固定canaryです。

アプリ、production migration、seed、release artifactからこのディレクトリを参照してはいけません。
