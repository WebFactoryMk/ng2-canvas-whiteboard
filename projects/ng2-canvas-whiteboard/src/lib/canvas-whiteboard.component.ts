import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  OnChanges, OnDestroy, AfterViewInit, NgZone, ChangeDetectorRef
} from '@angular/core';
import { CanvasWhiteboardUpdate, CanvasWhiteboardUpdateType } from './canvas-whiteboard-update.model';
import { DEFAULT_STYLES } from './template';
import { CanvasWhiteboardService } from './canvas-whiteboard.service';
import { CanvasWhiteboardOptions } from './canvas-whiteboard-options';
import { CanvasWhiteboardShape } from './shapes/canvas-whiteboard-shape';
import { CanvasWhiteboardPoint } from './canvas-whiteboard-point.model';
import { CanvasWhiteboardShapeService, INewCanvasWhiteboardShape } from './shapes/canvas-whiteboard-shape.service';
import { CanvasWhiteboardShapeOptions } from './shapes/canvas-whiteboard-shape-options';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { cloneDeep, isEqual } from 'lodash-es';

@Component({
  selector: 'canvas-whiteboard',
  template:
      `
    <div class="canvas_wrapper_div">
      <div class="canvas_whiteboard_buttons">
        <canvas-whiteboard-shape-selector *ngIf="shapeSelectorEnabled"
                                          [showShapeSelector]="showShapeSelector"
                                          [selectedShapeConstructor]="selectedShapeConstructor"
                                          [shapeOptions]="generateShapePreviewOptions()"
                                          (onToggleShapeSelector)="toggleShapeSelector($event)"
                                          (onShapeSelected)="selectShape($event)"></canvas-whiteboard-shape-selector>

        <canvas-whiteboard-colorpicker *ngIf="colorPickerEnabled || fillColorPickerEnabled"
                                       [previewText]="fillColorPickerText"
                                       [showColorPicker]="showFillColorPicker"
                                       [selectedColor]="fillColor"
                                       (onToggleColorPicker)="toggleFillColorPicker($event)"
                                       (onColorSelected)="changeFillColor($event)">
        </canvas-whiteboard-colorpicker>

        <canvas-whiteboard-colorpicker *ngIf="colorPickerEnabled || strokeColorPickerEnabled"
                                       [previewText]="strokeColorPickerText"
                                       [showColorPicker]="showStrokeColorPicker"
                                       [selectedColor]="strokeColor"
                                       (onToggleColorPicker)="toggleStrokeColorPicker($event)"
                                       (onColorSelected)="changeStrokeColor($event)">
        </canvas-whiteboard-colorpicker>


        <button *ngIf="drawButtonEnabled" (click)="toggleDrawingEnabled()"
                [class.canvas_whiteboard_button-draw_animated]="getDrawingEnabled()"
                class="canvas_whiteboard_button canvas_whiteboard_button-draw" type="button">
          <i [class]="drawButtonClass" aria-hidden="true"></i> {{drawButtonText}}
        </button>

        <button *ngIf="clearButtonEnabled" (click)="clearCanvasLocal()" type="button"
                class="canvas_whiteboard_button canvas_whiteboard_button-clear">
          <i [class]="clearButtonClass" aria-hidden="true"></i> {{clearButtonText}}
        </button>

        <button *ngIf="undoButtonEnabled" (click)="undoLocal()" type="button"
                class="canvas_whiteboard_button canvas_whiteboard_button-undo">
          <i [class]="undoButtonClass" aria-hidden="true"></i> {{undoButtonText}}
        </button>

        <button *ngIf="redoButtonEnabled" (click)="redoLocal()" type="button"
                class="canvas_whiteboard_button canvas_whiteboard_button-redo">
          <i [class]="redoButtonClass" aria-hidden="true"></i> {{redoButtonText}}
        </button>
        <button *ngIf="saveDataButtonEnabled" (click)="saveLocal()" type="button"
                class="canvas_whiteboard_button canvas_whiteboard_button-save">
          <i [class]="saveDataButtonClass" aria-hidden="true"></i> {{saveDataButtonText}}
        </button>
      </div>
      <canvas #canvas class="canvas_whiteboard"></canvas>
      <canvas #incompleteShapesCanvas class="incomplete_shapes_canvas_whiteboard"
              (mousedown)="canvasUserEvents($event)" (mouseup)="canvasUserEvents($event)"
              (mousemove)="canvasUserEvents($event)" (mouseout)="canvasUserEvents($event)"
              (touchstart)="canvasUserEvents($event)" (touchmove)="canvasUserEvents($event)"
              (touchend)="canvasUserEvents($event)" (touchcancel)="canvasUserEvents($event)"></canvas>
    </div>
  `,
  styles: [DEFAULT_STYLES]
})
export class CanvasWhiteboardComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input() options: CanvasWhiteboardOptions;

  // Number of ms to wait before sending out the updates as an array
  @Input() batchUpdateTimeoutDuration = 100;

  private _imageUrl: string;
  @Input() set imageUrl(imageUrl: string) {
    this._imageUrl = imageUrl;
    this._imageElement = null;
    this._redrawHistory();
  }

  get imageUrl(): string {
    return this._imageUrl;
  }

  @Input() aspectRatio: number;
  @Input() drawButtonClass: string;
  @Input() clearButtonClass: string;
  @Input() undoButtonClass: string;
  @Input() redoButtonClass: string;
  @Input() saveDataButtonClass: string;
  @Input() drawButtonText = '';
  @Input() clearButtonText = '';
  @Input() undoButtonText = '';
  @Input() redoButtonText = '';
  @Input() saveDataButtonText = '';
  @Input() strokeColorPickerText = 'Stroke';
  @Input() fillColorPickerText = 'Fill';
  @Input() drawButtonEnabled = true;
  @Input() clearButtonEnabled = true;
  @Input() undoButtonEnabled = false;
  @Input() redoButtonEnabled = false;
  @Input() saveDataButtonEnabled = false;
  @Input() shouldDownloadDrawing = true;
  /** @deprecated. Replaced with strokeColorPickerEnabled and fillColorPickerEnabled inputs */
  @Input() colorPickerEnabled: boolean = false;
  @Input() strokeColorPickerEnabled: boolean = false;
  @Input() fillColorPickerEnabled: boolean = false;
  @Input() lineWidth = 2;
  @Input() strokeColor = 'rgba(0, 0, 0, 1)';
  @Input() startingColor = '#fff';
  @Input() scaleFactor = 0;
  @Input() drawingEnabled = false;
  @Input() showStrokeColorPicker = false;
  @Input() showFillColorPicker = false;
  @Input() downloadedFileName: string;

  @Input() lineJoin = 'round';
  @Input() lineCap = 'round';
  @Input() shapeSelectorEnabled = true;
  @Input() showShapeSelector = false;
  @Input() fillColor = 'rgba(0,0,0,0)';

  @Output() onClear = new EventEmitter<any>();
  @Output() onUndo = new EventEmitter<any>();
  @Output() onRedo = new EventEmitter<any>();
  @Output() onBatchUpdate = new EventEmitter<CanvasWhiteboardUpdate[]>();
  @Output() onImageLoaded = new EventEmitter<any>();
  @Output() onSave = new EventEmitter<string | Blob>();

  @ViewChild('canvas', {static: true}) canvas: ElementRef;
  context: CanvasRenderingContext2D;

  @ViewChild('incompleteShapesCanvas', {static: true}) private _incompleteShapesCanvas: ElementRef;
  private _incompleteShapesCanvasContext: CanvasRenderingContext2D;
  private _incompleteShapesMap: Map<string, CanvasWhiteboardShape>;

  private _imageElement: any;

  private _canDraw = true;

  private _clientDragging = false;

  private _updateHistory: CanvasWhiteboardUpdate[] = [];
  private _lastUUID: string;
  private _shapesMap: Map<string, CanvasWhiteboardShape>;

  private _undoStack: string[] = []; // Stores the value of start and count for each continuous stroke
  private _redoStack: string[] = [];
  private _batchUpdates: CanvasWhiteboardUpdate[] = [];
  private _updatesNotDrawn: any = [];

  private _updateTimeout: any;

  private _canvasWhiteboardServiceSubscriptions: Subscription[] = [];
  private _resizeSubscription: Subscription;
  private _registeredShapesSubscription: Subscription;

  selectedShapeConstructor: INewCanvasWhiteboardShape<CanvasWhiteboardShape>;
  canvasWhiteboardShapePreviewOptions: CanvasWhiteboardShapeOptions;

  constructor(private ngZone: NgZone,
              private changeDetectorRef: ChangeDetectorRef,
              private canvasWhiteboardService: CanvasWhiteboardService,
              private canvasWhiteboardShapeService: CanvasWhiteboardShapeService) {
    this._shapesMap = new Map<string, CanvasWhiteboardShape>();
    this._incompleteShapesMap = new Map<string, CanvasWhiteboardShape>();
    this.canvasWhiteboardShapePreviewOptions = this.generateShapePreviewOptions();
  }

  /**
   * Initialize the canvas drawing context. If we have an aspect ratio set up, the canvas will resize
   * according to the aspect ratio.
   */
  ngOnInit(): void {
    this._initInputsFromOptions(this.options);
    this._initCanvasEventListeners();
    this._initCanvasServiceObservables();
    this.context = this.canvas.nativeElement.getContext('2d');
    this._incompleteShapesCanvasContext = this._incompleteShapesCanvas.nativeElement.getContext('2d');
  }

  /**
   * If an image exists and it's url changes, we need to redraw the new image on the canvas.
   */
  ngOnChanges(changes: any): void {
    if (changes.options && !isEqual(changes.options.currentValue, changes.options.previousValue)) {
      this._initInputsFromOptions(changes.options.currentValue);
    }
  }

  /**
   * Recalculate the width and height of the canvas after the view has been fully initialized
   */
  ngAfterViewInit(): void {
    this._calculateCanvasWidthAndHeight();
    this._redrawHistory();
  }

  /**
   * This method reads the options which are helpful since they can be really long when specified in HTML
   * This method is also called everytime the options object changes
   * For security reasons we must check each item on its own since if we iterate the keys
   * we may be injected with malicious values
   *
   * @param options
   */
  private _initInputsFromOptions(options: CanvasWhiteboardOptions): void {
    if (options) {
      if (!this._isNullOrUndefined(options.batchUpdateTimeoutDuration)) {
        this.batchUpdateTimeoutDuration = options.batchUpdateTimeoutDuration;
      }
      if (!this._isNullOrUndefined(options.imageUrl)) {
        this.imageUrl = options.imageUrl;
      }
      if (!this._isNullOrUndefined(options.aspectRatio)) {
        this.aspectRatio = options.aspectRatio;
      }
      if (!this._isNullOrUndefined(options.drawButtonClass)) {
        this.drawButtonClass = options.drawButtonClass;
      }
      if (!this._isNullOrUndefined(options.clearButtonClass)) {
        this.clearButtonClass = options.clearButtonClass;
      }
      if (!this._isNullOrUndefined(options.undoButtonClass)) {
        this.undoButtonClass = options.undoButtonClass;
      }
      if (!this._isNullOrUndefined(options.redoButtonClass)) {
        this.redoButtonClass = options.redoButtonClass;
      }
      if (!this._isNullOrUndefined(options.saveDataButtonClass)) {
        this.saveDataButtonClass = options.saveDataButtonClass;
      }
      if (!this._isNullOrUndefined(options.drawButtonText)) {
        this.drawButtonText = options.drawButtonText;
      }
      if (!this._isNullOrUndefined(options.clearButtonText)) {
        this.clearButtonText = options.clearButtonText;
      }
      if (!this._isNullOrUndefined(options.undoButtonText)) {
        this.undoButtonText = options.undoButtonText;
      }
      if (!this._isNullOrUndefined(options.redoButtonText)) {
        this.redoButtonText = options.redoButtonText;
      }
      if (!this._isNullOrUndefined(options.saveDataButtonText)) {
        this.saveDataButtonText = options.saveDataButtonText;
      }
      if (!this._isNullOrUndefined(options.strokeColorPickerText)) {
        this.strokeColorPickerText = options.strokeColorPickerText;
      }
      if (!this._isNullOrUndefined(options.fillColorPickerText)) {
        this.fillColorPickerText = options.fillColorPickerText;
      }
      if (!this._isNullOrUndefined(options.drawButtonEnabled)) {
        this.drawButtonEnabled = options.drawButtonEnabled;
      }
      if (!this._isNullOrUndefined(options.clearButtonEnabled)) {
        this.clearButtonEnabled = options.clearButtonEnabled;
      }
      if (!this._isNullOrUndefined(options.undoButtonEnabled)) {
        this.undoButtonEnabled = options.undoButtonEnabled;
      }
      if (!this._isNullOrUndefined(options.redoButtonEnabled)) {
        this.redoButtonEnabled = options.redoButtonEnabled;
      }
      if (!this._isNullOrUndefined(options.saveDataButtonEnabled)) {
        this.saveDataButtonEnabled = options.saveDataButtonEnabled;
      }
      if (!this._isNullOrUndefined(options.colorPickerEnabled)) {
        this.colorPickerEnabled = options.colorPickerEnabled;
      }
      if (!this._isNullOrUndefined(options.strokeColorPickerEnabled)) {
        this.strokeColorPickerEnabled = options.strokeColorPickerEnabled;
      }
      if (!this._isNullOrUndefined(options.fillColorPickerEnabled)) {
        this.fillColorPickerEnabled = options.fillColorPickerEnabled;
      }
      if (!this._isNullOrUndefined(options.lineWidth)) {
        this.lineWidth = options.lineWidth;
      }
      if (!this._isNullOrUndefined(options.strokeColor)) {
        this.strokeColor = options.strokeColor;
      }
      if (!this._isNullOrUndefined(options.shouldDownloadDrawing)) {
        this.shouldDownloadDrawing = options.shouldDownloadDrawing;
      }
      if (!this._isNullOrUndefined(options.startingColor)) {
        this.startingColor = options.startingColor;
      }
      if (!this._isNullOrUndefined(options.scaleFactor)) {
        this.scaleFactor = options.scaleFactor;
      }
      if (!this._isNullOrUndefined(options.drawingEnabled)) {
        this.drawingEnabled = options.drawingEnabled;
      }
      if (!this._isNullOrUndefined(options.downloadedFileName)) {
        this.downloadedFileName = options.downloadedFileName;
      }
      if (!this._isNullOrUndefined(options.lineJoin)) {
        this.lineJoin = options.lineJoin;
      }
      if (!this._isNullOrUndefined(options.lineCap)) {
        this.lineCap = options.lineCap;
      }
      if (!this._isNullOrUndefined(options.shapeSelectorEnabled)) {
        this.shapeSelectorEnabled = options.shapeSelectorEnabled;
      }
      if (!this._isNullOrUndefined(options.showShapeSelector)) {
        this.showShapeSelector = options.showShapeSelector;
      }
      if (!this._isNullOrUndefined(options.fillColor)) {
        this.fillColor = options.fillColor;
      }
      if (!this._isNullOrUndefined(options.showStrokeColorPicker)) {
        this.showStrokeColorPicker = options.showStrokeColorPicker;
      }
      if (!this._isNullOrUndefined(options.showFillColorPicker)) {
        this.showFillColorPicker = options.showFillColorPicker;
      }
    }
  }

  private _isNullOrUndefined(property: any): boolean {
    return property === null || property === undefined;
  }

  /**
   * Init global window listeners like resize and keydown
   */
  private _initCanvasEventListeners(): void {
    this.ngZone.runOutsideAngular(() => {
      this._resizeSubscription = fromEvent(window, 'resize')
        .pipe(
          debounceTime(200),
          distinctUntilChanged()
        )
        .subscribe(() => {
          this.ngZone.run(() => {
            this._redrawCanvasOnResize();
          });
        });
    });

    window.addEventListener('keydown', this._canvasKeyDown.bind(this), false);
  }

  /**
   * Subscribes to new signals in the canvas whiteboard service and executes methods accordingly
   * Because of circular publishing and subscribing, the canvas methods do not use the service when
   * local actions are completed (Ex. clicking undo from the button inside this component)
   */
  private _initCanvasServiceObservables(): void {
    this._canvasWhiteboardServiceSubscriptions.push(this.canvasWhiteboardService.canvasDrawSubject$
      .subscribe(updates => this.drawUpdates(updates)));
    this._canvasWhiteboardServiceSubscriptions.push(this.canvasWhiteboardService.canvasClearSubject$
      .subscribe(() => this.clearCanvas()));
    this._canvasWhiteboardServiceSubscriptions.push(this.canvasWhiteboardService.canvasUndoSubject$
      .subscribe((updateUUD) => this._undoCanvas(updateUUD)));
    this._canvasWhiteboardServiceSubscriptions.push(this.canvasWhiteboardService.canvasRedoSubject$
      .subscribe((updateUUD) => this._redoCanvas(updateUUD)));

    this._registeredShapesSubscription = this.canvasWhiteboardShapeService.registeredShapes$.subscribe((shapes) => {
      if (!this.selectedShapeConstructor || !this.canvasWhiteboardShapeService.isRegisteredShape(this.selectedShapeConstructor)) {
        this.selectedShapeConstructor = shapes[0];
      }
    });
  }

  /**
   * Calculate the canvas width and height from it's parent container width and height (use aspect ratio if needed)
   */
  private _calculateCanvasWidthAndHeight(): void {
    this.context.canvas.width = this.canvas.nativeElement.parentNode.clientWidth;
    if (this.aspectRatio) {
      this.context.canvas.height = this.canvas.nativeElement.parentNode.clientWidth * this.aspectRatio;
    } else {
      this.context.canvas.height = this.canvas.nativeElement.parentNode.clientHeight;
    }

    this._incompleteShapesCanvasContext.canvas.width = this.context.canvas.width;
    this._incompleteShapesCanvasContext.canvas.height = this.context.canvas.height;
  }

  /**
   * Load an image and draw it on the canvas (if an image exists)
   * @param callbackFn A function that is called after the image loading is finished
   * @return Emits a value when the image has been loaded.
   */
  private _loadImage(callbackFn?: any): void {
    this._canDraw = false;

    // If we already have the image there is no need to acquire it
    if (this._imageElement) {
      this._canDraw = true;
      callbackFn && callbackFn();
      return;
    }

    this._imageElement = new Image();
    this._imageElement.crossOrigin = 'Anonymous';
    this._imageElement.addEventListener('load', () => {
      this._canDraw = true;
      callbackFn && callbackFn();
      this.onImageLoaded.emit(true);
    });
    this._imageElement.src = this.imageUrl;
  }

  /**
   * Sends a notification after clearing the canvas
   * This method should only be called from the clear button in this component since it will emit an clear event
   * If the client calls this method he may create a circular clear action which may cause danger.
   */
  clearCanvasLocal(): void {
    this.clearCanvas();
    this.onClear.emit(true);
  }

  /**
   * Clears all content on the canvas.
   */
  clearCanvas(): void {
    this._removeCanvasData();
    this._redoStack = [];
  }

  /**
   * This method resets the state of the canvas and redraws it.
   * It calls a callback function after redrawing
   * @param callbackFn
   */
  private _removeCanvasData(callbackFn?: any): void {
    this._shapesMap = new Map<string, CanvasWhiteboardShape>();
    this._clientDragging = false;
    this._updateHistory = [];
    this._undoStack = [];
    this._redrawBackground(callbackFn);
  }

  /**
   * Clears the canvas and redraws the image if the url exists.
   * @param callbackFn A function that is called after the background is redrawn
   * @return Emits a value when the clearing is finished
   */
  private _redrawBackground(callbackFn?: any): void {
    if (this.context) {
      if (this.imageUrl) {
        this._loadImage(() => {
          this.context.save();
          this._drawImage(this.context, this._imageElement, 0, 0, this.context.canvas.width, this.context.canvas.height, 0.5, 0.5);
          this.context.restore();
          this._drawMissingUpdates();
          callbackFn && callbackFn();
        });
      } else {
        this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
        this._drawStartingColor();
        callbackFn && callbackFn();
      }
    }
  }

  private _drawStartingColor(): void {
    const previousFillStyle = this.context.fillStyle;
    this.context.save();

    this.context.fillStyle = this.startingColor;
    this.context.fillRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    this.context.fillStyle = previousFillStyle;

    this.context.restore();
  }


  /**
   * @deprecated Use getDrawingEnabled(): boolean
   */
  getShouldDraw(): boolean {
    return this.getDrawingEnabled();
  }

  /**
   * Returns a value of whether the user clicked the draw button on the canvas.
   */
  getDrawingEnabled(): boolean {
    return this.drawingEnabled;
  }

  /**
   * Toggles drawing on the canvas. It is called via the draw button on the canvas.
   */
  toggleDrawingEnabled(): void {
    this.drawingEnabled = !this.drawingEnabled;
  }

  /**
   * Set if drawing is enabled from the client using the canvas
   * @param drawingEnabled
   */
  setDrawingEnabled(drawingEnabled: boolean): void {
    this.drawingEnabled = drawingEnabled;
  }

  /**
   * @deprecated Please use the changeStrokeColor(newStrokeColor: string): void method
   */
  changeColor(newStrokeColor: string): void {
    this.changeStrokeColor(newStrokeColor);
  }

  /**
   * Replaces the drawing color with a new color
   * The format should be ("#ffffff" or "rgb(r,g,b,a?)")
   * This method is public so that anyone can access the canvas and change the stroke color
   *
   * @param newStrokeColor The new stroke color
   */
  changeStrokeColor(newStrokeColor: string): void {
    this.strokeColor = newStrokeColor;

    this.canvasWhiteboardShapePreviewOptions = this.generateShapePreviewOptions();
    this.changeDetectorRef.detectChanges();
  }

  /**
   * Replaces the fill color with a new color
   * The format should be ("#ffffff" or "rgb(r,g,b,a?)")
   * This method is public so that anyone can access the canvas and change the fill color
   *
   * @param newFillColor The new fill color
   */
  changeFillColor(newFillColor: string): void {
    this.fillColor = newFillColor;
    this.canvasWhiteboardShapePreviewOptions = this.generateShapePreviewOptions();
    this.changeDetectorRef.detectChanges();
  }

  /**
   * This method is invoked by the undo button on the canvas screen
   * It calls the global undo method and emits a notification after undoing.
   * This method should only be called from the undo button in this component since it will emit an undo event
   * If the client calls this method he may create a circular undo action which may cause danger.
   */
  undoLocal(): void {
    this.undo((updateUUID) => {
      this._redoStack.push(updateUUID);
      this.onUndo.emit(updateUUID);
    });
  }

  /**
   * This methods selects the last uuid prepares it for undoing (making the whole update sequence invisible)
   * This method can be called if the canvas component is a ViewChild of some other component.
   * This method will work even if the undo button has been disabled
   */
  undo(callbackFn?: (updateUUID: string) => void): void {
    if (!this._undoStack.length) {
      return;
    }

    const updateUUID = this._undoStack.pop();
    this._undoCanvas(updateUUID);
    callbackFn && callbackFn(updateUUID);
  }

  /**
   * This method takes an UUID for an update, and redraws the canvas by making all updates with that uuid invisible
   * @param updateUUID
   */
  private _undoCanvas(updateUUID: string): void {
    if (this._shapesMap.has(updateUUID)) {
      const shape = this._shapesMap.get(updateUUID);
      shape.isVisible = false;
      this.drawAllShapes();
    }
  }

  /**
   * This method is invoked by the redo button on the canvas screen
   * It calls the global redo method and emits a notification after redoing
   * This method should only be called from the redo button in this component since it will emit an redo event
   * If the client calls this method he may create a circular redo action which may cause danger.
   */
  redoLocal(): void {
    this.redo((updateUUID) => {
      this._undoStack.push(updateUUID);
      this.onRedo.emit(updateUUID);
    });
  }

  /**
   * This methods selects the last uuid prepares it for redoing (making the whole update sequence visible)
   * This method can be called if the canvas component is a ViewChild of some other component.
   * This method will work even if the redo button has been disabled
   */
  redo(callbackFn?: any): void {
    if (!this._redoStack.length) {
      return;
    }

    const updateUUID = this._redoStack.pop();
    this._redoCanvas(updateUUID);
    callbackFn && callbackFn(updateUUID);
  }

  /**
   * This method takes an UUID for an update, and redraws the canvas by making all updates with that uuid visible
   * @param updateUUID
   */
  private _redoCanvas(updateUUID: string): void {
    if (this._shapesMap.has(updateUUID)) {
      const shape = this._shapesMap.get(updateUUID);
      shape.isVisible = true;

      this.drawAllShapes();
    }
  }

  /**
   * Catches the Mouse and Touch events made on the canvas.
   * If drawing is disabled (If an image exists but it's not loaded, or the user did not click Draw),
   * this function does nothing.
   *
   * If a "mousedown | touchstart" event is triggered, dragging will be set to true and an CanvasWhiteboardUpdate object
   * of type "start" will be drawn and then sent as an update to all receiving ends.
   *
   * If a "mousemove | touchmove" event is triggered and the client is dragging, an CanvasWhiteboardUpdate object
   * of type "drag" will be drawn and then sent as an update to all receiving ends.
   *
   * If a "mouseup, mouseout | touchend, touchcancel" event is triggered, dragging will be set to false and
   * an CanvasWhiteboardUpdate object of type "stop" will be drawn and then sent as an update to all receiving ends.
   *
   */
  canvasUserEvents(event: any): void {
    // Ignore all if we didn't click the _draw! button or the image did not load
    if (!this.drawingEnabled || !this._canDraw) {
      return;
    }

    // Ignore mouse move Events if we're not dragging
    if (!this._clientDragging
      && (event.type === 'mousemove'
        || event.type === 'touchmove'
        || event.type === 'mouseout'
        || event.type === 'touchcancel'
        || event.type === 'mouseup'
        || event.type === 'touchend'
        || event.type === 'mouseout')) {
      return;
    }

    if (event.target == this._incompleteShapesCanvas.nativeElement || event.target == this.canvas.nativeElement) {
      event.preventDefault();
    }

    let update: CanvasWhiteboardUpdate;
    let updateType: number;
    const eventPosition: CanvasWhiteboardPoint = this._getCanvasEventPosition(event);
    update = new CanvasWhiteboardUpdate(eventPosition.x, eventPosition.y);

    switch (event.type) {
      case 'mousedown':
      case 'touchstart':
        this._clientDragging = true;
        this._lastUUID = this._generateUUID();
        updateType = CanvasWhiteboardUpdateType.START;
        this._redoStack = [];

        this._addCurrentShapeDataToAnUpdate(update);
        break;
      case 'mousemove':
      case 'touchmove':
        if (!this._clientDragging) {
          return;
        }
        updateType = CanvasWhiteboardUpdateType.DRAG;
        break;
      case 'touchcancel':
      case 'mouseup':
      case 'touchend':
      case 'mouseout':
        this._clientDragging = false;
        updateType = CanvasWhiteboardUpdateType.STOP;
        this._undoStack.push(this._lastUUID);
        break;
    }

    update.UUID = this._lastUUID;
    update.type = updateType;

    this._draw(update);
    this._prepareToSendUpdate(update);
  }

  /**
   * Get the coordinates (x,y) from a given event
   * If it is a touch event, get the touch positions
   * If we released the touch, the position will be placed in the changedTouches object
   * If it is not a touch event, use the original mouse event received
   * @param eventData
   */
  private _getCanvasEventPosition(eventData: any): CanvasWhiteboardPoint {
    const canvasBoundingRect = this.context.canvas.getBoundingClientRect();

    let hasTouches = (eventData.touches && eventData.touches.length) ? eventData.touches[0] : null;
    if (!hasTouches) {
      hasTouches = (eventData.changedTouches && eventData.changedTouches.length) ? eventData.changedTouches[0] : null;
    }

    const event = hasTouches ? hasTouches : eventData;

    const scaleWidth = canvasBoundingRect.width / this.context.canvas.width;
    const scaleHeight = canvasBoundingRect.height / this.context.canvas.height;

    let xPosition = (event.clientX - canvasBoundingRect.left);
    let yPosition = (event.clientY - canvasBoundingRect.top);

    xPosition /= this.scaleFactor ? this.scaleFactor : scaleWidth;
    yPosition /= this.scaleFactor ? this.scaleFactor : scaleHeight;

    return new CanvasWhiteboardPoint(xPosition / this.context.canvas.width, yPosition / this.context.canvas.height);
  }

  /**
   * The update coordinates on the canvas are mapped so that all receiving ends
   * can reverse the mapping and get the same position as the one that
   * was drawn on this update.
   *
   * @param update The CanvasWhiteboardUpdate object.
   */
  private _prepareToSendUpdate(update: CanvasWhiteboardUpdate): void {
    this._prepareUpdateForBatchDispatch(update);
  }


  /**
   * Catches the Key Up events made on the canvas.
   * If the ctrlKey or commandKey(macOS) was held and the keyCode is 90 (z), an undo action will be performed
   * If the ctrlKey or commandKey(macOS) was held and the keyCode is 89 (y), a redo action will be performed
   * If the ctrlKey or commandKey(macOS) was held and the keyCode is 83 (s) or 115(S), a save action will be performed
   *
   * @param event The event that occurred.
   */
  private _canvasKeyDown(event: any): void {
    if (event.ctrlKey || event.metaKey) {
      if (event.keyCode === 90 && this.undoButtonEnabled) {
        event.preventDefault();
        this.undo();
      }
      if (event.keyCode === 89 && this.redoButtonEnabled) {
        event.preventDefault();
        this.redo();
      }
      if (event.keyCode === 83 || event.keyCode === 115) {
        event.preventDefault();
        this.saveLocal();
      }
    }
  }

  /**
   * On window resize, recalculate the canvas dimensions and redraw the history
   */
  private _redrawCanvasOnResize(): void {
    this._calculateCanvasWidthAndHeight();
    this._redrawHistory();
  }

  /**
   * Redraw the saved history after resetting the canvas state
   */
  private _redrawHistory(): void {
    const updatesToDraw = [].concat(this._updateHistory);

    this._removeCanvasData(() => {
      updatesToDraw.forEach((update: CanvasWhiteboardUpdate) => {
        this._draw(update);
      });
    });
  }

  /**
   * Draws a CanvasWhiteboardUpdate object on the canvas.
   * The coordinates are first reverse mapped so that they can be drawn in the proper place. The update
   * is afterwards added to the undoStack so that it can be
   *
   * If the CanvasWhiteboardUpdate Type is "start", a new "selectedShape" is created.
   * If the CanvasWhiteboardUpdate Type is "drag", the shape is taken from the shapesMap and then it's updated.
   * Afterwards the context is used to draw the shape on the canvas.
   * This function saves the last X and Y coordinates that were drawn.
   *
   * @param update The update object.
   */
  private _draw(update: CanvasWhiteboardUpdate): void {
    this._updateHistory.push(update);

    // map the canvas coordinates to our canvas size since they are scaled.
    update = Object.assign(new CanvasWhiteboardUpdate(),
      update,
      {
        x: update.x * this.context.canvas.width,
        y: update.y * this.context.canvas.height
      });

    if (update.type === CanvasWhiteboardUpdateType.START) {
      const updateShapeConstructor = this.canvasWhiteboardShapeService.getShapeConstructorFromShapeName(update.selectedShape);
      const shape = new updateShapeConstructor(
        new CanvasWhiteboardPoint(update.x, update.y),
        Object.assign(new CanvasWhiteboardShapeOptions(), update.selectedShapeOptions)
      );
      this._incompleteShapesMap.set(update.UUID, shape);
      this._drawIncompleteShapes();
    } else if (update.type === CanvasWhiteboardUpdateType.DRAG) {
      const shape = this._incompleteShapesMap.get(update.UUID);
      shape && shape.onUpdateReceived(update);
      this._drawIncompleteShapes();
    } else if (CanvasWhiteboardUpdateType.STOP) {
      const shape = this._incompleteShapesMap.get(update.UUID);
      shape && shape.onStopReceived(update);

      this._shapesMap.set(update.UUID, shape);
      this._incompleteShapesMap.delete(update.UUID);
      this._swapCompletedShapeToActualCanvas(shape);
    }
  }

  private _drawIncompleteShapes(): void {
    this._resetIncompleteShapeCanvas();
    this._incompleteShapesMap.forEach((shape) => {
      if (shape.isVisible) {
        shape.draw(this._incompleteShapesCanvasContext);
      }
    });
  }

  private _swapCompletedShapeToActualCanvas(shape: CanvasWhiteboardShape): void {
    this._drawIncompleteShapes();
    if (shape.isVisible) {
      shape.draw(this.context);
    }
  }

  private _resetIncompleteShapeCanvas(): void {
    this._incompleteShapesCanvasContext.clearRect(0, 0, this._incompleteShapesCanvasContext.canvas.width,
      this._incompleteShapesCanvasContext.canvas.height);
    this._incompleteShapesCanvasContext.fillStyle = 'transparent';
    this._incompleteShapesCanvasContext.fillRect(0, 0, this._incompleteShapesCanvasContext.canvas.width,
      this._incompleteShapesCanvasContext.canvas.height);
  }

  /**
   * Delete everything from the screen, redraw the background, and then redraw all the shapes from the shapesMap
   */
  drawAllShapes(): void {
    this._redrawBackground(() => {
      this._shapesMap.forEach((shape: CanvasWhiteboardShape) => {
        if (shape.isVisible) {
          shape.draw(this.context);
        }
      });
    });
  }

  private _addCurrentShapeDataToAnUpdate(update: CanvasWhiteboardUpdate): void {
    if (!update.selectedShape) {
      update.selectedShape = (new this.selectedShapeConstructor).getShapeName();
    }

    if (!update.selectedShapeOptions) {
      // Make a deep copy since we don't want some Shape implementation to change something by accident
      update.selectedShapeOptions = Object.assign(new CanvasWhiteboardShapeOptions(),
        this.generateShapePreviewOptions(), {lineWidth: this.lineWidth});
    }
  }

  generateShapePreviewOptions(): CanvasWhiteboardShapeOptions {
    return Object.assign(new CanvasWhiteboardShapeOptions(),
      {
        shouldFillShape: !!this.fillColor,
        fillStyle: this.fillColor,
        strokeStyle: this.strokeColor,
        lineWidth: 2,
        lineJoin: this.lineJoin,
        lineCap: this.lineCap
      });
  }

  /**
   * Sends the update to all receiving ends as an Event emit. This is done as a batch operation (meaning
   * multiple updates are sent at the same time). If this method is called, after 100 ms all updates
   * that were made at that time will be packed up together and sent to the receiver.
   *
   * @param update The update object.
   * @return Emits an Array of Updates when the batch.
   */
  private _prepareUpdateForBatchDispatch(update: CanvasWhiteboardUpdate): void {
    this._batchUpdates.push(cloneDeep(update));
    if (!this._updateTimeout) {
      this._updateTimeout = setTimeout(() => {
        this.onBatchUpdate.emit(this._batchUpdates);
        this._batchUpdates = [];
        this._updateTimeout = null;
      }, this.batchUpdateTimeoutDuration);
    }
  }

  /**
   * Draws an Array of Updates on the canvas.
   *
   * @param updates The array with Updates.
   */
  drawUpdates(updates: CanvasWhiteboardUpdate[]): void {
    if (this._canDraw) {
      this._drawMissingUpdates();
      updates.forEach((update: CanvasWhiteboardUpdate) => {
        this._draw(update);
      });
    } else {
      this._updatesNotDrawn = this._updatesNotDrawn.concat(updates);
    }
  }

  /**
   * Draw any missing updates that were received before the image was loaded
   */
  private _drawMissingUpdates(): void {
    if (this._updatesNotDrawn.length > 0) {
      const updatesToDraw = this._updatesNotDrawn;
      this._updatesNotDrawn = [];

      updatesToDraw.forEach((update: CanvasWhiteboardUpdate) => {
        this._draw(update);
      });
    }
  }

  /**
   * Draws an image on the canvas
   *
   * @param context The context used to draw the image on the canvas.
   * @param image The image to draw.
   * @param x The X coordinate for the starting draw position.
   * @param y The Y coordinate for the starting draw position.
   * @param width The width of the image that will be drawn.
   * @param height The height of the image that will be drawn.
   * @param offsetX The offsetX if the image size is larger than the canvas (aspect Ratio)
   * @param offsetY The offsetY if the image size is larger than the canvas (aspect Ratio)
   */
  private _drawImage(context: any, image: any, x: number, y: number, width: number, height: number, offsetX: number, offsetY: number): void {
    if (arguments.length === 2) {
      x = y = 0;
      width = context.canvas.width;
      height = context.canvas.height;
    }

    offsetX = typeof offsetX === 'number' ? offsetX : 0.5;
    offsetY = typeof offsetY === 'number' ? offsetY : 0.5;

    if (offsetX < 0) {
      offsetX = 0;
    }
    if (offsetY < 0) {
      offsetY = 0;
    }
    if (offsetX > 1) {
      offsetX = 1;
    }
    if (offsetY > 1) {
      offsetY = 1;
    }

    const imageWidth = image.width;
    const imageHeight = image.height;
    const radius = Math.min(width / imageWidth, height / imageHeight);
    let newWidth = imageWidth * radius;
    let newHeight = imageHeight * radius;
    let finalDrawX: any;
    let finalDrawY: any;
    let finalDrawWidth: any;
    let finalDrawHeight: any;
    let aspectRatio = 1;

    // decide which gap to fill
    if (newWidth < width) {
      aspectRatio = width / newWidth;
    }
    if (Math.abs(aspectRatio - 1) < 1e-14 && newHeight < height) {
      aspectRatio = height / newHeight;
    }
    newWidth *= aspectRatio;
    newHeight *= aspectRatio;

    // calculate source rectangle
    finalDrawWidth = imageWidth / (newWidth / width);
    finalDrawHeight = imageHeight / (newHeight / height);

    finalDrawX = (imageWidth - finalDrawWidth) * offsetX;
    finalDrawY = (imageHeight - finalDrawHeight) * offsetY;

    // make sure the source rectangle is valid
    if (finalDrawX < 0) {
      finalDrawX = 0;
    }
    if (finalDrawY < 0) {
      finalDrawY = 0;
    }
    if (finalDrawWidth > imageWidth) {
      finalDrawWidth = imageWidth;
    }
    if (finalDrawHeight > imageHeight) {
      finalDrawHeight = imageHeight;
    }

    // fill the image in destination rectangle
    context.drawImage(image, finalDrawX, finalDrawY, finalDrawWidth, finalDrawHeight, x, y, width, height);
  }

  /**
   * The HTMLCanvasElement.toDataURL() method returns a data URI containing a representation of the image in the format specified by the type parameter (defaults to PNG).
   * The returned image is in a resolution of 96 dpi.
   * If the height or width of the canvas is 0, the string "data:," is returned.
   * If the requested type is not image/png, but the returned value starts with data:image/png, then the requested type is not supported.
   * Chrome also supports the image/webp type.
   *
   * @param returnedDataType A DOMString indicating the image format. The default format type is image/png.
   * @param returnedDataQuality A Number between 0 and 1 indicating image quality if the requested type is image/jpeg or image/webp.
   If this argument is anything else, the default value for image quality is used. The default value is 0.92. Other arguments are ignored.
   */
  generateCanvasDataUrl(returnedDataType: string = 'image/png', returnedDataQuality: number = 1): string {
    return this.context.canvas.toDataURL(returnedDataType, returnedDataQuality);
  }

  /**
   * Generate a Blob object representing the content drawn on the canvas.
   * This file may be cached on the disk or stored in memory at the discretion of the user agent.
   * If type is not specified, the image type is image/png. The created image is in a resolution of 96dpi.
   * The third argument is used with image/jpeg images to specify the quality of the output.
   *
   * @param callbackFn The function that should be executed when the blob is created. Should accept a parameter Blob (for the result).
   * @param returnedDataType A DOMString indicating the image format. The default type is image/png.
   * @param returnedDataQuality A Number between 0 and 1 indicating image quality if the requested type is image/jpeg or image/webp.
   If this argument is anything else, the default value for image quality is used. Other arguments are ignored.
   */
  generateCanvasBlob(callbackFn: any, returnedDataType: string = 'image/png', returnedDataQuality: number = 1): void {
    let toBlobMethod: Function;

    if (typeof this.context.canvas.toBlob !== 'undefined') {
      toBlobMethod = this.context.canvas.toBlob.bind(this.context.canvas);
    } else if (typeof (this.context.canvas as any).msToBlob !== 'undefined') {
      // For IE
      toBlobMethod = (callback) => {
        callback && callback((this.context.canvas as any).msToBlob());
      };
    }

    toBlobMethod && toBlobMethod((blob: Blob) => {
      callbackFn && callbackFn(blob, returnedDataType);
    }, returnedDataType, returnedDataQuality);
  }

  /**
   * Generate a canvas image representation and download it locally
   * The name of the image is canvas_drawing_ + the current local Date and Time the image was created
   * Methods for standalone creation of the images in this method are left here for backwards compatibility
   *
   * @param returnedDataType A DOMString indicating the image format. The default type is image/png.
   * @param downloadData? The created string or Blob (IE).
   * @param customFileName? The name of the file that should be downloaded
   */
  downloadCanvasImage(returnedDataType: string = 'image/png', downloadData?: string | Blob, customFileName?: string): void {
    if (window.navigator.msSaveOrOpenBlob === undefined) {
      const downloadLink = document.createElement('a');
      downloadLink.setAttribute('href', downloadData ? downloadData as string : this.generateCanvasDataUrl(returnedDataType));

      const fileName = customFileName ? customFileName
        : (this.downloadedFileName ? this.downloadedFileName : 'canvas_drawing_' + new Date().valueOf());

      downloadLink.setAttribute('download', fileName + this._generateDataTypeString(returnedDataType));
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } else {
      // IE-specific code
      if (downloadData) {
        this._saveCanvasBlob(downloadData as Blob, returnedDataType);
      } else {
        this.generateCanvasBlob(this._saveCanvasBlob.bind(this), returnedDataType);
      }
    }
  }

  /**
   * Save the canvas blob (IE) locally
   * @param blob
   * @param returnedDataType
   */
  private _saveCanvasBlob(blob: Blob, returnedDataType: string = 'image/png'): void {
    window.navigator.msSaveOrOpenBlob(blob, 'canvas_drawing_' +
      new Date().valueOf() + this._generateDataTypeString(returnedDataType));
  }

  /**
   * This method generates a canvas url string or a canvas blob with the presented data type
   * A callback function is then invoked since the blob creation must be done via a callback
   *
   * @param callback
   * @param returnedDataType
   * @param returnedDataQuality
   */
  generateCanvasData(callback: any, returnedDataType: string = 'image/png', returnedDataQuality: number = 1): void {
    if (window.navigator.msSaveOrOpenBlob === undefined) {
      callback && callback(this.generateCanvasDataUrl(returnedDataType, returnedDataQuality));
    } else {
      this.generateCanvasBlob(callback, returnedDataType, returnedDataQuality);
    }
  }

  /**
   * Local method to invoke saving of the canvas data when clicked on the canvas Save button
   * This method will emit the generated data with the specified Event Emitter
   *
   * @param returnedDataType
   */
  saveLocal(returnedDataType: string = 'image/png'): void {
    this.generateCanvasData((generatedData: string | Blob) => {
      this.onSave.emit(generatedData);

      if (this.shouldDownloadDrawing) {
        this.downloadCanvasImage(returnedDataType, generatedData);
      }
    });
  }

  private _generateDataTypeString(returnedDataType: string): string {
    if (returnedDataType) {
      return '.' + returnedDataType.split('/')[1];
    }

    return '';
  }

  /**
   * Toggles the color picker window, delegating the showColorPicker Input to the ColorPickerComponent.
   * If no value is supplied (null/undefined) the current value will be negated and used.
   * @param value
   */
  toggleStrokeColorPicker(value: boolean): void {
    this.showStrokeColorPicker = !this._isNullOrUndefined(value) ? value : !this.showStrokeColorPicker;
  }

  /**
   * Toggles the color picker window, delegating the showColorPicker Input to the ColorPickerComponent.
   * If no value is supplied (null/undefined) the current value will be negated and used.
   * @param value
   */
  toggleFillColorPicker(value: boolean): void {
    this.showFillColorPicker = !this._isNullOrUndefined(value) ? value : !this.showFillColorPicker;
  }

  /**
   * Toggles the shape selector window, delegating the showShapeSelector Input to the CanvasWhiteboardShapeSelectorComponent.
   * If no value is supplied (null/undefined) the current value will be negated and used.
   * @param value
   */
  toggleShapeSelector(value: boolean): void {
    this.showShapeSelector = !this._isNullOrUndefined(value) ? value : !this.showShapeSelector;
  }

  selectShape(newShapeBlueprint: INewCanvasWhiteboardShape<CanvasWhiteboardShape>): void {
    this.selectedShapeConstructor = newShapeBlueprint;
  }

  /**
   * Returns a deep copy of the current drawing history for the canvas.
   * The deep copy is returned because we don't want anyone to mutate the current history
   */
  getDrawingHistory(): CanvasWhiteboardUpdate[] {
    return cloneDeep(this._updateHistory);
  }

  /**
   * Unsubscribe from a given subscription if it is active
   * @param subscription
   */
  private _unsubscribe(subscription: Subscription): void {
    if (subscription) {
      subscription.unsubscribe();
    }
  }

  private _generateUUID(): string {
    return this._random4() + this._random4() + '-' + this._random4() + '-' + this._random4() + '-' +
      this._random4() + '-' + this._random4() + this._random4() + this._random4();
  }

  private _random4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  /**
   * Unsubscribe from the service observables
   */
  ngOnDestroy(): void {
    this._unsubscribe(this._resizeSubscription);
    this._unsubscribe(this._registeredShapesSubscription);
    this._canvasWhiteboardServiceSubscriptions.forEach(subscription => this._unsubscribe(subscription));
  }
}
