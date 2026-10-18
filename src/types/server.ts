export type ServerGlobalConfig = {
  workshopPath: string;
  startScriptPath: string;
  stopGraceTimeoutMs: number;
  forceKillTimeoutMs: number;
};

export const SCHEDULED_ACTIONS = [
  "start",
  "stop",
  "force-stop",
  "restart",
  "backup",
] as const;

export type ScheduledAction = (typeof SCHEDULED_ACTIONS)[number];

export type ScheduledCommand = {
  id: string;
  name: string;
  action: ScheduledAction;
  cron: string;
  enabled: boolean;
};

export type ServerInstance = {
  id: string;
  name: string;
  iniPath: string;
  savePath: string;
  startArgs: string[];
  stopCommands: string[];
  scheduledCommands: ScheduledCommand[];
};

export type ServersConfig = {
  global: ServerGlobalConfig;
  servers: ServerInstance[];
};

export type ServerRuntimeStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error"
  | "unknown";

export type ServerLastExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  at: string;
};

export type ServerRuntimeState = {
  serverId: string;
  status: ServerRuntimeStatus;
  pid: number | null;
  startedAt: string | null;
  lastExit: ServerLastExit | null;
};

export type ServersRuntimeSnapshot = {
  activeServerId: string | null;
  servers: ServerRuntimeState[];
};

export type TerminalLine = {
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
};
