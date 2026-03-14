const encoder = new TextEncoder();

export function createSSEStream(): {
  stream: ReadableStream;
  send: (event: string, data: unknown) => void;
  close: () => void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });

  const send = (event: string, data: unknown): void => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  };

  const close = (): void => {
    controller.close();
  };

  return { stream, send, close };
}

export function parseSSEMessage(
  line: string
): { event: string; data: string } | null {
  const eventMatch = line.match(/^event:\s*(.+)$/m);
  const dataMatch = line.match(/^data:\s*(.+)$/m);

  if (!eventMatch || !dataMatch) {
    return null;
  }

  return {
    event: eventMatch[1].trim(),
    data: dataMatch[1].trim(),
  };
}
