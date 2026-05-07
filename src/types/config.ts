export type ConfigEncoding = "utf8" | "utf8-bom";

export type ConfigNewline = "lf" | "crlf";

export type ConfigItem = {
  key: string;
  value: string;
};

export type ConfigMeta = {
  encoding: ConfigEncoding;
  newline: ConfigNewline;
};

export type GetConfigItemDto = ConfigItem & {
  zhName: string | null;
  description: string | null;
  isKnown: boolean;
};

export type GetConfigResponseDto = {
  configPath: string;
  items: GetConfigItemDto[];
  meta: ConfigMeta;
};

export type PutConfigRequestDto = {
  items: ConfigItem[];
};

export type PutConfigResponseDto = {
  ok: true;
};

export type SubMod = {
  name: string;
  id: string;
  description: string;
  poster: string;
  icon: string;
  path: string;
  require: string[];
  category: string[];
  loadModBefore: string[];
  loadModAfter: string[];
  incompatible: string[];
  author: string;
  url: string;
  modversion: string;
  pack: string[];
  tiledef: string[];
  versionMin: string;
  versionMax: string;
};

export type WorkshopItem = {
  id: string;
  isDownloaded: boolean;
  subMods: SubMod[];
  maps: string[];
};
