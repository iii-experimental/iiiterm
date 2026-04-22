import { describe, expect, it } from 'vitest';
import * as browserSdk from 'iii-browser-sdk';

/**
 * The browser peer in web/src/App.tsx relies on a narrow slice of
 * iii-browser-sdk. This test pins that slice down so a surprise SDK upgrade
 * breaks one test here instead of a blank dashboard at runtime.
 */
describe('iii-browser-sdk contract the web peer depends on', () => {
  it('exports registerWorker as a function', () => {
    expect(typeof browserSdk.registerWorker).toBe('function');
  });

  it('exports TriggerAction with Void and Enqueue factories', () => {
    expect(typeof browserSdk.TriggerAction.Void).toBe('function');
    expect(typeof browserSdk.TriggerAction.Enqueue).toBe('function');
    const voidAction = browserSdk.TriggerAction.Void();
    expect(voidAction).toEqual({ type: 'void' });
    const enqueue = browserSdk.TriggerAction.Enqueue({ queue: 'jobs' });
    expect(enqueue).toEqual({ type: 'enqueue', queue: 'jobs' });
  });

  it('exports ChannelWriter and ChannelReader as constructors', () => {
    expect(typeof browserSdk.ChannelWriter).toBe('function');
    expect(typeof browserSdk.ChannelReader).toBe('function');
  });

  it('declares registerWorker with the expected arity for the web peer', () => {
    /* registerWorker(url, options?) -> ISdk.  The browser SDK builds a live
       WebSocket inside the constructor, so we don't actually invoke it here
       -- the construction + reconnect loop is exercised by the web peer at
       runtime.  Locking the signature down is enough to catch an SDK
       contract break at compile + lint time. */
    expect(browserSdk.registerWorker.length).toBeLessThanOrEqual(2);
    expect(browserSdk.registerWorker.length).toBeGreaterThanOrEqual(1);
  });
});
