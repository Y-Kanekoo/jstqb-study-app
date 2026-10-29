export class StorageConflictError extends Error {
  constructor() {
    super('保存データが別のタブで更新されました。画面を再読み込みしてから操作してください。');
    this.name = 'StorageConflictError';
  }
}
