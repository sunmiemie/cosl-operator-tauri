/**
 * Status types for backend and setup states
 */
import { z } from 'zod'

/**
 * Backend health check response
 */
export const BackendStatusSchema = z.object({
  status: z.enum(['OK', 'ERROR']),
  message: z.string(),
})

export type BackendStatus = z.infer<typeof BackendStatusSchema>

/**
 * Backend initialization status
 */
export enum InitStatus {
  IDLE = 'idle',
  CHECKING = 'checking',
  INSTALLING = 'installing',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * Backend running status
 */
export enum BackendRunStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  ERROR = 'error',
}

/**
 * Setup process status
 */
export type SetupStatus = {
  status: 'running' | 'completed' | 'pending' | 'error'
  stage:
    | 'check-blocks-resource'
    | 'check-python-installation'
    | 'install-dependencies'
    | 'spawn-captain'
  message: string
}

/**
 * Node execution status
 */
export type NodeRunStatus = {
  nodeId: string
  status: 'pending' | 'running' | 'success' | 'error'
  result?: unknown
  error?: string
}
