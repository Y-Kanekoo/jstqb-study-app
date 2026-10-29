export function createWriteQueue<T>(write: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let tail = Promise.resolve();
  return (value) => {
    const current = tail.then(() => write(value));
    tail = current.catch(() => undefined);
    return current;
  };
}
