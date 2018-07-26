import { CanvasWhiteboardShape } from "./shapes/canvas-whiteboard-shape";
import { INewableShape } from "./shapes/canvas-whiteboard-shape.service";
import { CanvasWhiteboardShapeOptions } from "./shapes/canvas-whiteboard-shape-options";
export declare enum CanvasWhiteboardUpdateType {
    START = 0,
    DRAG = 1,
    STOP = 2,
}
export declare class CanvasWhiteboardUpdate {
    x: number;
    y: number;
    type: CanvasWhiteboardUpdateType;
    UUID: string;
    selectedShape: INewableShape<CanvasWhiteboardShape>;
    selectedShapeOptions: CanvasWhiteboardShapeOptions;
    constructor(x?: number, y?: number, type?: CanvasWhiteboardUpdateType, UUID?: string, selectedShape?: INewableShape<CanvasWhiteboardShape>, selectedShapeOptions?: CanvasWhiteboardShapeOptions);
    static deserializeJson(json: any): CanvasWhiteboardUpdate;
    stringify(): string;
}
