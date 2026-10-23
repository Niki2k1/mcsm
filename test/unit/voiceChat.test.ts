import { describe, expect, it } from "vitest";
import {
  activeVoicePort,
  pickVoicePort,
  VOICE_CHAT_DEFAULT_PORT,
  voiceChatConfigPath,
  VoicePortConflictError,
} from "../../shared/utils/voiceChat";

describe("pickVoicePort", () => {
  it("starts at the plugin's default port", () => {
    expect(pickVoicePort({ used: [] })).toBe(VOICE_CHAT_DEFAULT_PORT);
  });

  it("skips ports other servers already use", () => {
    expect(pickVoicePort({ used: [24454, 24455, 24457] })).toBe(24456);
  });

  it("accepts a free requested port", () => {
    expect(pickVoicePort({ requested: 30000, used: [24454] })).toBe(30000);
  });

  it("rejects a requested port that is taken", () => {
    expect(() => pickVoicePort({ requested: 24454, used: [24454] })).toThrow(
      VoicePortConflictError
    );
  });

  it("keeps the previous port across recreates", () => {
    expect(pickVoicePort({ previous: 24460, used: [24454] })).toBe(24460);
  });

  it("reassigns the previous port when another server took it", () => {
    expect(pickVoicePort({ previous: 24454, used: [24454] })).toBe(24455);
  });

  it("prefers an explicit request over the previous port", () => {
    expect(pickVoicePort({ requested: 25000, previous: 24460, used: [] })).toBe(
      25000
    );
  });
});

describe("activeVoicePort", () => {
  it("counts only servers that publish a voice port", () => {
    expect(
      activeVoicePort({ type: "PAPER", VOICE_CHAT: true, voicePort: 24454 })
    ).toBe(24454);
    expect(
      activeVoicePort({ type: "PAPER", VOICE_CHAT: false, voicePort: 24454 })
    ).toBeNull();
    expect(
      activeVoicePort({ type: "VANILLA", VOICE_CHAT: true, voicePort: 24454 })
    ).toBeNull();
    expect(activeVoicePort(null)).toBeNull();
  });
});

describe("voiceChatConfigPath", () => {
  it("uses plugins/ for Paper and config/ for mod loaders", () => {
    expect(voiceChatConfigPath("PAPER")).toBe(
      "plugins/voicechat/voicechat-server.properties"
    );
    expect(voiceChatConfigPath("FABRIC")).toBe(
      "config/voicechat/voicechat-server.properties"
    );
    expect(voiceChatConfigPath("FORGE")).toBe(
      "config/voicechat/voicechat-server.properties"
    );
  });
});
