import type { ChannelWriter as ChannelWriterType } from 'iii-sdk';
import { ChannelWriter } from 'iii-sdk';
import type { AgentChunkSource } from './run.js';

/**
 * Minimal, serializable shape that a caller must pass to stream partial agent
 * output. The engineWsBase is recorded here explicitly so the worker can
 * attach to the caller-created channel without assuming any ambient URL.
 */
export interface AgentStreamRef {
  writerRef: unknown;
  engineWsBase: string;
}

export function openWriter(ref: AgentStreamRef): ChannelWriterType {
  return new ChannelWriter(ref.engineWsBase, ref.writerRef as never);
}

export interface StreamChunkMessage {
  source: AgentChunkSource;
  chunk: string;
}

export function streamHandler(
  writer: ChannelWriterType,
): (chunk: string, source: AgentChunkSource) => void {
  return (chunk, source) => {
    try {
      const msg: StreamChunkMessage = { source, chunk };
      writer.sendMessage(JSON.stringify(msg));
    } catch {
      /* writer already closed or disconnected -- best-effort */
    }
  };
}

export interface OptionalStreamInput {
  stream?: AgentStreamRef;
}

/**
 * Build an onChunk callback from an optional stream ref.  Returns a pair of
 * (onChunk, close) so worker handlers can wire streaming into runAgent and
 * close the channel exactly once after the CLI exits.
 */
export function makeStream(
  input: OptionalStreamInput,
): { onChunk?: (chunk: string, source: AgentChunkSource) => void; close: () => void } {
  if (!input.stream) return { close: () => {} };
  let writer: ChannelWriterType | undefined;
  try {
    writer = openWriter(input.stream);
  } catch {
    return { close: () => {} };
  }
  return {
    onChunk: streamHandler(writer),
    close: () => {
      try {
        writer?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
