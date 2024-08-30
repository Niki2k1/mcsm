import mc from "@ahdg/minecraftstatuspinger";

export interface ServerStatusOptions {
  host: string;
  port?: number;
  timeout?: number;
  ping?: boolean;
  protocolVersion?: number;
  throwOnParseError?: boolean;
  disableSRV?: boolean;
  disableJSONParse?: boolean;
}

export const useMinecraftServer = async (options: ServerStatusOptions) => {
  return await mc.lookup(options);
};
