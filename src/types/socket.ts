/**
 * WebSocket communication types
 */
import { z } from 'zod'
import type { BlockResult } from './block-result'

/**
 * Server status enum - all possible states
 */
export enum ServerStatus {
  // Server-side statuses
  STANDBY = '🐢 awaiting a new job',
  RUNNING_PYTHON_JOB = '🏃‍♀️ running python job: ',
  FAILED_BLOCK = '❌ Failed to run: ',
  RUN_PRE_JOB_OP = '⏳ running pre-job operation...',
  BUILDING_TOPOLOGY = ' 🔨 building flow chart...',
  MAXIMUM_RUNTIME_EXCEEDED = '⏰ maximum runtime exceeded',
  COLLECTING_PIP_DEPENDENCIES = ' 📦 collecting pip dependencies...',
  INSTALLING_PACKAGES = '✨ installing missing packages...',
  IMPORTING_BLOCK_FUNCTIONS = ' 📦 importing node functions...',
  PRE_JOB_OP_FAILED = '❌ pre-job operation failed - Re-run script...',
  RUN_IN_PROCESS = '🏃‍♀️ running script...',
  IMPORTING_BLOCK_FUNCTIONS_FAILED = '❌ importing node functions failed',

  // Client-side statuses
  OFFLINE = '🛑 server offline',
  CONNECTING = 'Connecting to server...',
  CONNECTED = '✅ Connected',
}

/**
 * Zod schema for ServerStatus enum
 */
export const ServerStatusEnum = z.nativeEnum(ServerStatus)
export type ServerStatusEnum = z.infer<typeof ServerStatusEnum>

/**
 * Worker job response message schema
 */
export const WorkerJobResponseSchema = z.object({
  jobsetId: z.string().optional(),
  socketId: z.string().optional(),
  SYSTEM_STATUS: ServerStatusEnum.optional(),
  type: z.enum([
    'worker_response',
    'connection_established',
    'manifest_update',
  ]),
  FAILED_NODES: z.record(z.string()).optional(),
  RUNNING_NODE: z.string().optional(),
  NODE_RESULTS: z
    .object({
      cmd: z.string(),
      id: z.string(),
      result: z.custom<BlockResult>(),
    })
    .optional(),
})

export type WorkerJobResponse = z.infer<typeof WorkerJobResponseSchema>

/**
 * WebSocket connection state
 */
export type SocketState = {
  connected: boolean
  socketId: string | null
  serverStatus: ServerStatus
  lastError: string | null
}

/**
 * WebSocket message types for sending
 */
export type SocketMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; jobsetId: string }
  | { type: 'unsubscribe'; jobsetId: string }
