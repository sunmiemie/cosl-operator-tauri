/**
 * Centralized type exports for Flojoy functionality
 *
 * This module provides a unified export point for all type definitions
 * used throughout the cosl-operator-tauri application.
 *
 * Usage:
 * import { BlockData, DeviceInfo, ServerStatus } from '@/types'
 */

// ========== Utility Types ==========
export {
  type Nullish,
  type DeepMutable,
  type FilteredKeys,
  type RemoveNever,
  type ValuesOf,
  getEntries,
  typedObjectKeys,
  typedObjectFromEntries,
  getZodEnumFromObjectKeys,
} from './util'

// ========== Edge Types ==========
export {
  type EdgeVariant,
  type EdgeData,
  getEdgeColor,
} from './edge'

// ========== Status Types ==========
export {
  BackendStatusSchema,
  type BackendStatus,
  InitStatus,
  BackendRunStatus,
  type SetupStatus,
  type NodeRunStatus,
} from './status'

// ========== Socket Types ==========
export {
  ServerStatus,
  ServerStatusEnum,
  WorkerJobResponseSchema,
  type WorkerJobResponse,
  type SocketState,
  type SocketMessage,
} from './socket'

// ========== Data Container Types ==========
export {
  ALL_DC_TYPE,
  type DataContainerType,
  type Scalar,
  type Vector,
  type Matrix,
  type DataFrame,
  type Image,
  type Grayscale,
  type OrderedPair,
  type OrderedTriple,
  type StringDC,
  type BooleanDC,
  type DataContainer,
  isDataContainerType,
  getDataContainerDisplayName,
} from './data-container'

// ========== Plotly Types ==========
export {
  type OverridePlotData,
  type PlotlyFigure,
  type PlotProps,
  defaultPlotlyConfig,
  getThemedLayout,
  thumbnailLayout,
} from './plotly'

// ========== Block Result Types ==========
export {
  type BlockResult,
  type NodeResult,
  hasPlotlyFigure,
  hasTextBlob,
  hasDataContainer,
  getResultType,
  formatResultPreview,
} from './block-result'

// ========== Manifest Types ==========
export {
  blockIoSchema,
  blockInputSchema,
  blockOutputSchema,
  type BlockIO,
  type BlockInput,
  type BlockOutput,
  blockParameterValue,
  type BlockParameterValue,
  blockParameterSchema,
  type ParamDefinition,
  pipDependencySchema,
  type PipDependency,
  blockDefinitionSchema,
  type BlockDefinition,
  type Leaf,
  blockSectionSchema,
  type BlockSection,
  type ParentNode,
  blockManifestSchema,
  type BlockManifest,
  type RootNode,
  type LeafParentNode,
  type RootChild,
  type TreeNode,
  blockMetadataSchema,
  type BlockMetadata,
  isLeafNode,
  isSectionNode,
  getAllLeafNodes,
  findBlockByKey,
} from './manifest'

// ========== Hardware Types ==========
export {
  CameraDeviceSchema,
  type CameraDevice,
  SerialDeviceSchema,
  type SerialDevice,
  VISADeviceSchema,
  type VISADevice,
  NIDAQmxDeviceSchema,
  type NIDAQmxDevice,
  NIDMMDeviceSchema,
  type NIDMMDevice,
  DeviceInfoSchema,
  type DeviceInfo,
  LegacyDeviceInfoSchema,
  type LegacyDeviceInfo,
  type DeviceCategory,
  DEVICE_CATEGORIES,
  getDeviceCategoryName,
  getDeviceCategoryIcon,
  convertLegacyDeviceInfo,
  getTotalDeviceCount,
  hasAnyDevices,
} from './hardware'

// ========== Block Data Types ==========
export {
  type CtrlData,
  type BlockData,
  type BlockProps,
  type TextData,
  type TextProps,
  positionSchema,
  type Position,
  type NodeRunState,
  type NodeWithState,
  createCtrlDataFromDefinition,
  createBlockDataFromDefinition,
  createInitCtrlDataFromDefinition,
  getParamValue,
  updateParamValue,
} from './block'

// ========== Control Widget Types ==========
export {
  PYTHON_TYPES,
  PythonType,
  SliderConfig,
  KnobConfig,
  FileUploadConfig,
  NumberInputConfig,
  type WidgetEntry,
  WIDGET_TYPES,
  type WidgetType,
  isWidgetType,
  WIDGET_CONFIGS,
  type Configurable,
  isConfigurable,
  type ConfigMap,
  type WidgetConfig,
  WidgetBlockInfo,
  type WidgetData,
  type WidgetProps,
  FLOJOY_TYPES,
  FlojoyType,
  type VisualizationEntry,
  VISUALIZATION_TYPES,
  type VisualizationType,
  type VisualizationData,
  type VisualizationProps,
  type ControlTextData,
  type ControlTextProps,
  getDefaultWidgetForType,
  getAllowedWidgetsForType,
} from './control'

// ========== OCR Types ==========
export {
  type OcrRegion,
  type TextBox,
  type OcrRegionResult,
  type OcrFrameResult,
  type OcrInitOptions,
  type OcrStreamOptions,
  type OcrEventType,
  type OcrResultEventPayload,
  type OcrErrorEventPayload,
} from './ocr'
