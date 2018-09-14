import {Injectable} from "@angular/core";
import {CanvasWhiteboardShape} from "./canvas-whiteboard-shape";
import {BehaviorSubject} from "rxjs";
import {Observable} from "rxjs";
import {CircleShape} from "./circle-shape";
import {RectangleShape} from "./rectangle-shape";
import {FreeHandShape} from "./free-hand-shape";
import {CanvasWhiteboardShapeOptions} from "./canvas-whiteboard-shape-options";
import {CanvasWhiteboardPoint} from "../canvas-whiteboard-point";
import {SmileyShape} from "./smiley-shape";
import {StarShape} from "./star-shape";
import {LineShape} from "./line-shape";

export interface INewCanvasWhiteboardShape<T extends CanvasWhiteboardShape> {
    new(positionPoint?: CanvasWhiteboardPoint, options?: CanvasWhiteboardShapeOptions, ...args: any[]): T;
}

@Injectable()
export class CanvasWhiteboardShapeService {
    private _registeredShapesSubject: BehaviorSubject<INewCanvasWhiteboardShape<CanvasWhiteboardShape>[]>;
    public registeredShapes$: Observable<INewCanvasWhiteboardShape<CanvasWhiteboardShape>[]>;

    constructor() {
        this._registeredShapesSubject = new BehaviorSubject([FreeHandShape, LineShape, RectangleShape, CircleShape, StarShape, SmileyShape]);
        this.registeredShapes$ = this._registeredShapesSubject.asObservable();
    }

    getShapeConstructorFromShapeName(shapeName: string): INewCanvasWhiteboardShape<CanvasWhiteboardShape> {
        return this.getCurrentRegisteredShapes().find((shape) => shape.name == shapeName);
    }

    getCurrentRegisteredShapes(): INewCanvasWhiteboardShape<CanvasWhiteboardShape>[] {
        return this._registeredShapesSubject.getValue();
    }

    isRegisteredShape(shape: INewCanvasWhiteboardShape<CanvasWhiteboardShape>) {
        return this.getCurrentRegisteredShapes().indexOf(shape) != -1;
    }

    registerShape(shape: INewCanvasWhiteboardShape<CanvasWhiteboardShape>) {
        if (this.isRegisteredShape(shape)) {
            console.warn(`You tried to register a shape:${shape}, but is has already been registered.`);
            return;
        }

        let registeredShapes = this.getCurrentRegisteredShapes();
        registeredShapes.push(shape);
        this._registeredShapesSubject.next(registeredShapes);
    }

    registerShapes(shapes: INewCanvasWhiteboardShape<CanvasWhiteboardShape>[]) {
        this._registeredShapesSubject.next(
            this.getCurrentRegisteredShapes()
                .concat(
                    shapes.filter((shape) => {
                        if (this.isRegisteredShape(shape)) {
                            console.warn(`You tried to register a shape:${shape}, but is has already been registered.`);
                            return false;
                        }

                        return true;
                    })
                )
        );
    }

    unregisterShape(shape: INewCanvasWhiteboardShape<CanvasWhiteboardShape>) {
        this._registeredShapesSubject.next(this.getCurrentRegisteredShapes().filter((registeredShape) => registeredShape != shape));
    }

    unregisterShapes(shapes: INewCanvasWhiteboardShape<CanvasWhiteboardShape>[]) {
        this._registeredShapesSubject.next(this.getCurrentRegisteredShapes().filter((shape) => shapes.indexOf(shape) == -1));
    }
}