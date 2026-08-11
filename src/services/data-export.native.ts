import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function deliverTextFile(fileName: string, mimeType: string, content: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('この端末ではファイル共有を利用できません。');
  }
  const file = new File(Paths.cache, fileName);
  file.create({ intermediates: true, overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: fileName,
    mimeType,
    UTI: mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text',
  });
}
