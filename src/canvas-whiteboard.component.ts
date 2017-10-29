import {
    Component,
    Input,
    Output,
    EventEmitter,
    ViewChild,
    ElementRef,
    OnInit,
    OnChanges
} from '@angular/core';
import { CanvasWhiteboardUpdate, UPDATE_TYPE } from "./canvas-whiteboard-update.model";
import { DEFAULT_TEMPLATE, DEFAULT_STYLES } from "./template";

interface EventPositionPoint {
    x: number,
    y: number
}

@Component({
    selector: 'canvas-whiteboard',
    template: DEFAULT_TEMPLATE,
    styles: [DEFAULT_STYLES]
})
export class CanvasWhiteboardComponent implements OnInit, OnChanges {

    //Number of ms to wait before sending out the updates as an array
    @Input() batchUpdateTimeoutDuration: number = 100;

    @Input() imageUrl: string;
    @Input() aspectRatio: number;

    @Input() drawButtonClass: string;
    @Input() clearButtonClass: string;
    @Input() undoButtonClass: string;
    @Input() redoButtonClass: string;
    @Input() saveDataButtonClass: string;

    @Input() drawButtonText: string = "";
    @Input() clearButtonText: string = "";
    @Input() undoButtonText: string = "";
    @Input() redoButtonText: string = "";
    @Input() saveDataButtonText: string = "";

    @Input() drawButtonEnabled: boolean = true;
    @Input() clearButtonEnabled: boolean = true;
    @Input() undoButtonEnabled: boolean = false;
    @Input() redoButtonEnabled: boolean = false;
    @Input() saveDataButtonEnabled: boolean = false;

    @Input() colorPickerEnabled: boolean = false;

    @Input() lineWidth: number = 2;
    @Input() strokeColor: string = "rgb(216, 184, 0)";

    @Output() onClear = new EventEmitter<any>();
    @Output() onUndo = new EventEmitter<any>();
    @Output() onRedo = new EventEmitter<any>();
    @Output() onBatchUpdate = new EventEmitter<CanvasWhiteboardUpdate[]>();
    @Output() onImageLoaded = new EventEmitter<any>();

    @ViewChild('canvas') canvas: ElementRef;

    context: CanvasRenderingContext2D;

    private _imageElement: HTMLImageElement;

    private _shouldDraw = false;
    private _canDraw = true;

    private _clientDragging = false;

    private _lastUUID: string;
    private _lastPositionForUUID: Object = {};

    private _undoStack: string[] = []; //Stores the value of start and count for each continuous stroke
    private _redoStack: string[] = [];
    private _drawHistory: CanvasWhiteboardUpdate[] = [];
    private _batchUpdates: CanvasWhiteboardUpdate[] = [];
    private _updatesNotDrawn: any = [];

    private _updateTimeout: any;

    /**
     * Initialize the canvas drawing context. If we have an aspect ratio set up, the canvas will resize
     * according to the aspect ratio.
     */
    ngOnInit() {
        this._initCanvasEventListeners();
        this.context = this.canvas.nativeElement.getContext("2d");
        this._calculateCanvasWidthAndHeight();
    }

    private _initCanvasEventListeners() {
        window.addEventListener("resize", this._redrawCanvasOnResize.bind(this), false);
        window.addEventListener("keydown", this._canvasKeyDown.bind(this), false);
    }

    private _calculateCanvasWidthAndHeight() {
        this.context.canvas.width = this.canvas.nativeElement.parentNode.clientWidth;
        if (this.aspectRatio) {
            this.context.canvas.height = this.canvas.nativeElement.parentNode.clientWidth * this.aspectRatio;
        } else {
            this.context.canvas.height = this.canvas.nativeElement.parentNode.clientHeight;
        }
    }

    /**
     * If an image exists and it's url changes, we need to redraw the new image on the canvas.
     */
    ngOnChanges(changes: any) {
        if (changes.imageUrl && changes.imageUrl.currentValue != changes.imageUrl.previousValue) {
            if (changes.imageUrl.currentValue != null) {
                this._loadImage();
            } else {
                this._canDraw = false;
                this._redrawBackground();
            }
        }
    }

    /**
     * Load an image and draw it on the canvas (if an image exists)
     * @constructor
     * @param callbackFn A function that is called after the image loading is finished
     * @return Emits a value when the image has been loaded.
     */
    private _loadImage(callbackFn?: any) {
        this._canDraw = false;
        this._imageElement = new Image();
        this._imageElement.addEventListener("load", () => {
            this.context.save();
            this._drawImage(this.context, this._imageElement, 0, 0, this.context.canvas.width, this.context.canvas.height, 0.5, 0.5);
            this.context.restore();
            this.drawMissingUpdates();
            this._canDraw = true;
            callbackFn && callbackFn();
            this.onImageLoaded.emit(true);
        });
        this._imageElement.src = this.imageUrl;
    }

    /**
     * Clears all content on the canvas.
     * @return Emits a value when the clearing is finished
     */
    clearCanvas(shouldEmitValue: boolean = false) {
        this._removeCanvasData();
        this._redoStack = [];

        if (shouldEmitValue)
            this.onClear.emit(true);
    }

    private _removeCanvasData(callbackFn?: any) {
        this._clientDragging = false;
        this._drawHistory = [];
        this._undoStack = [];
        this._redrawBackground(callbackFn);
    }

    /**
     * Clears the canvas and redraws the image if the url exists.
     * @param callbackFn A function that is called after the background is redrawn
     * @return Emits a value when the clearing is finished
     */
    private _redrawBackground(callbackFn?: any) {
        if (this.context) {
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
            if (this.imageUrl) {
                this._loadImage(() => {
                    callbackFn && callbackFn();
                });
            } else {
                callbackFn && callbackFn();
            }
        }
    }

    /**
     * Returns a value of whether the user clicked the draw button on the canvas.
     */
    getShouldDraw() {
        return this._shouldDraw;
    }

    /**
     * Toggles drawing on the canvas. It is called via the draw button on the canvas.
     */
    toggleShouldDraw() {
        this._shouldDraw = !this._shouldDraw;
    }

    /**
     * Replaces the drawing color with a new color
     * The format should be ("#ffffff" or "rgb(r,g,b,a?)")
     * This method is public so that anyone can access the canvas and change the stroke color
     *
     * @param {string} newStrokeColor The new stroke color
     */
    changeColor(newStrokeColor: string) {
        this.strokeColor = newStrokeColor;
    }

    undo(shouldEmitValue: boolean = false) {
        if (!this._undoStack.length || !this.undoButtonEnabled) return;

        let updateUUID = this._undoStack.pop();
        this._undoCanvas(updateUUID);

        if (shouldEmitValue)
            this.onUndo.emit(updateUUID);
    }

    private _undoCanvas(updateUUID: string) {
        this._redoStack.push(updateUUID);

        this._drawHistory.forEach((update: CanvasWhiteboardUpdate) => {
            if (update.getUUID() === updateUUID) {
                update.setVisible(false);
            }
        });

        this._redrawHistory();
    }

    redo(shouldEmitValue: boolean = false) {
        if (!this._redoStack.length || !this.redoButtonEnabled) return;

        let updateUUID = this._redoStack.pop();
        this._redoCanvas(updateUUID);

        if (shouldEmitValue)
            this.onRedo.emit(updateUUID);
    }

    private _redoCanvas(updateUUID: string) {
        this._undoStack.push(updateUUID);

        this._drawHistory.forEach((update: CanvasWhiteboardUpdate) => {
            if (update.getUUID() === updateUUID) {
                update.setVisible(true);
            }
        });

        this._redrawHistory();
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
    canvasUserEvents(event: any) {
        if (!this._shouldDraw || !this._canDraw) {
            //Ignore all if we didn't click the _draw! button or the image did not load
            return;
        }

        if ((event.type === 'mousemove' || event.type === 'touchmove' || event.type === 'mouseout') && !this._clientDragging) {
            // Ignore mouse move Events if we're not dragging
            return;
        }

        if (event.target == this.canvas.nativeElement) {
            event.preventDefault();
        }

        let update: CanvasWhiteboardUpdate;
        let updateType: number;
        let eventPosition: EventPositionPoint = this._getCanvasEventPosition(event);

        switch (event.type) {
            case 'mousedown':
            case 'touchstart':
                this._clientDragging = true;
                this._lastUUID = eventPosition.x + eventPosition.y + Math.random().toString(36);
                updateType = UPDATE_TYPE.start;
                break;
            case 'mousemove':
            case 'touchmove':
                if (!this._clientDragging) {
                    return;
                }
                updateType = UPDATE_TYPE.drag;
                break;
            case 'touchcancel':
            case 'mouseup':
            case 'touchend':
            case 'mouseout':
                this._clientDragging = false;
                updateType = UPDATE_TYPE.stop;
                break;
        }

        update = new CanvasWhiteboardUpdate(eventPosition.x, eventPosition.y, updateType, this.strokeColor, this._lastUUID, true);
        this._draw(update);
        this._prepareToSendUpdate(update, eventPosition.x, eventPosition.y);
    }

    private _getCanvasEventPosition(eventData: any) {
        let canvasBoundingRect = this.context.canvas.getBoundingClientRect();

        let hasTouches = (eventData.touches && eventData.touches.length) ? eventData.touches[0] : null;
        if (!hasTouches)
            hasTouches = (eventData.changedTouches && eventData.changedTouches.length) ? eventData.changedTouches[0] : null;

        let event = hasTouches ? hasTouches : eventData;

        return {
            x: event.clientX - canvasBoundingRect.left,
            y: event.clientY - canvasBoundingRect.top
        }
    }

    /**
     * The update coordinates on the canvas are mapped so that all receiving ends
     * can reverse the mapping and get the same position as the one that
     * was drawn on this update.
     *
     * @param {CanvasWhiteboardUpdate} update The CanvasWhiteboardUpdate object.
     * @param {number} eventX The offsetX that needs to be mapped
     * @param {number} eventY The offsetY that needs to be mapped
     */
    private _prepareToSendUpdate(update: CanvasWhiteboardUpdate, eventX: number, eventY: number) {
        update.setX(eventX / this.context.canvas.width);
        update.setY(eventY / this.context.canvas.height);
        this.sendUpdate(update);
    }


    /**
     * Catches the Key Up events made on the canvas.
     * If the ctrlKey or commandKey(macOS) was held and the keyCode is 90 (z), an undo action will be performed
     *If the ctrlKey or commandKey(macOS) was held and the keyCode is 89 (y), a redo action will be performed
     *
     * @param event The event that occurred.
     */
    private _canvasKeyDown(event: any) {
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
                this.downloadCanvasImage();
            }
        }
    }

    private _redrawCanvasOnResize(event: any) {
        this._calculateCanvasWidthAndHeight();
        this._redrawHistory();
    }

    private _redrawHistory() {
        let updatesToDraw = [].concat(this._drawHistory);

        this._removeCanvasData(() => {
            updatesToDraw.forEach((update: CanvasWhiteboardUpdate) => {
                this._draw(update, true);
            });
        });
    }

    /**
     * Draws an CanvasWhiteboardUpdate object on the canvas. if mappedCoordinates? is set, the coordinates
     * are first reverse mapped so that they can be drawn in the proper place. The update
     * is afterwards added to the undoStack so that it can be
     *
     * If the CanvasWhiteboardUpdate Type is "drag", the context is used to draw on the canvas.
     * This function saves the last X and Y coordinates that were drawn.
     *
     * @param {CanvasWhiteboardUpdate} update The update object.
     * @param {boolean} mappedCoordinates? The offsetX that needs to be mapped
     */
    private _draw(update: CanvasWhiteboardUpdate, mappedCoordinates?: boolean) {
        this._drawHistory.push(update);

        let xToDraw = (mappedCoordinates) ? (update.getX() * this.context.canvas.width) : update.getX();
        let yToDraw = (mappedCoordinates) ? (update.getY() * this.context.canvas.height) : update.getY();

        if (update.getType() === UPDATE_TYPE.drag) {
            let lastPosition = this._lastPositionForUUID[update.getUUID()];

            this.context.save();
            this.context.beginPath();
            this.context.lineWidth = this.lineWidth;

            if (update.getVisible()) {
                this.context.strokeStyle = update.getStrokeColor() || this.strokeColor;
            } else {
                this.context.strokeStyle = "rgba(0,0,0,0)";
            }
            this.context.lineJoin = "round";

            this.context.moveTo(lastPosition.x, lastPosition.y);

            this.context.lineTo(xToDraw, yToDraw);
            this.context.closePath();
            this.context.stroke();
            this.context.restore();
        } else if (update.getType() === UPDATE_TYPE.stop && update.getVisible()) {
            this._undoStack.push(update.getUUID());
            delete this._lastPositionForUUID[update.getUUID()];

        }

        if (update.getType() === UPDATE_TYPE.start || update.getType() === UPDATE_TYPE.drag) {
            this._lastPositionForUUID[update.getUUID()] = {
                x: xToDraw,
                y: yToDraw
            };
        }
    }

    /**
     * Sends the update to all receiving ends as an Event emit. This is done as a batch operation (meaning
     * multiple updates are sent at the same time). If this method is called, after 100 ms all updates
     * that were made at that time will be packed up together and sent to the receiver.
     *
     * @param {CanvasWhiteboardUpdate} update The update object.
     * @return Emits an Array of Updates when the batch.
     */
    sendUpdate(update: CanvasWhiteboardUpdate) {
        this._batchUpdates.push(update);
        if (!this._updateTimeout) {
            this._updateTimeout = setTimeout(() => {
                this.onBatchUpdate.emit(this._batchUpdates);
                this._batchUpdates = [];
                this._updateTimeout = null;
            }, this.batchUpdateTimeoutDuration);
        }
    };

    /**
     * Draws an Array of Updates on the canvas.
     *
     * @param {CanvasWhiteboardUpdate[]} updates The array with Updates.
     */
    drawUpdates(updates: CanvasWhiteboardUpdate[]) {
        if (this._canDraw) {
            this.drawMissingUpdates();
            updates.forEach((update: CanvasWhiteboardUpdate) => {
                this._draw(update, true);
            });
        } else {
            this._updatesNotDrawn = this._updatesNotDrawn.concat(updates);
        }
    };

    /**
     * Draw any missing updates that were received before the image was loaded
     *
     */
    drawMissingUpdates() {
        if (this._updatesNotDrawn.length > 0) {
            let updatesToDraw = [].concat(this._updatesNotDrawn);
            this._updatesNotDrawn = [];
            updatesToDraw.forEach((update: CanvasWhiteboardUpdate) => {
                this._draw(update, true);
            });
        }
    }

    /**
     * Draws an image on the canvas
     *
     * @param {CanvasRenderingContext2D} context The context used to draw the image on the canvas.
     * @param {HTMLImageElement} image The image to draw.
     * @param {number} x The X coordinate for the starting draw position.
     * @param {number} y The Y coordinate for the starting draw position.
     * @param {number} width The width of the image that will be drawn.
     * @param {number} height The height of the image that will be drawn.
     * @param {number} offsetX The offsetX if the image size is larger than the canvas (aspect Ratio)
     * @param {number} offsetY The offsetY if the image size is larger than the canvas (aspect Ratio)
     */
    private _drawImage(context: any, image: any, x: number, y: number, width: number, height: number, offsetX: number, offsetY: number) {
        if (arguments.length === 2) {
            x = y = 0;
            width = context.canvas.width;
            height = context.canvas.height;
        }

        offsetX = typeof offsetX === 'number' ? offsetX : 0.5;
        offsetY = typeof offsetY === 'number' ? offsetY : 0.5;

        if (offsetX < 0) offsetX = 0;
        if (offsetY < 0) offsetY = 0;
        if (offsetX > 1) offsetX = 1;
        if (offsetY > 1) offsetY = 1;

        let imageWidth = image.width;
        let imageHeight = image.height;
        let radius = Math.min(width / imageWidth, height / imageHeight);
        let newWidth = imageWidth * radius;
        let newHeight = imageHeight * radius;
        let finalDrawX: any;
        let finalDrawY: any;
        let finalDrawWidth: any;
        let finalDrawHeight: any;
        let aspectRatio = 1;

        // decide which gap to fill
        if (newWidth < width) aspectRatio = width / newWidth;
        if (Math.abs(aspectRatio - 1) < 1e-14 && newHeight < height) aspectRatio = height / newHeight;
        newWidth *= aspectRatio;
        newHeight *= aspectRatio;

        // calculate source rectangle
        finalDrawWidth = imageWidth / (newWidth / width);
        finalDrawHeight = imageHeight / (newHeight / height);

        finalDrawX = (imageWidth - finalDrawWidth) * offsetX;
        finalDrawY = (imageHeight - finalDrawHeight) * offsetY;

        // make sure the source rectangle is valid
        if (finalDrawX < 0) finalDrawX = 0;
        if (finalDrawY < 0) finalDrawY = 0;
        if (finalDrawWidth > imageWidth) finalDrawWidth = imageWidth;
        if (finalDrawHeight > imageHeight) finalDrawHeight = imageHeight;

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
     * @param {string} returnedDataType A DOMString indicating the image format. The default format type is image/png.
     * @param {number} returnedDataQuality A Number between 0 and 1 indicating image quality if the requested type is image/jpeg or image/webp.
     If this argument is anything else, the default value for image quality is used. The default value is 0.92. Other arguments are ignored.
     */
    generateCanvasDataUrl(returnedDataType: string = "image/png", returnedDataQuality: number = 1): string {
        return this.context.canvas.toDataURL(returnedDataType, returnedDataQuality);
    }

    /**
     * Generate a Blob object representing the content drawn on the canvas.
     * This file may be cached on the disk or stored in memory at the discretion of the user agent.
     * If type is not specified, the image type is image/png. The created image is in a resolution of 96dpi.
     * The third argument is used with image/jpeg images to specify the quality of the output.
     *
     * @param {any} callbackFn The function that should be executed when the blob is created. Should accept a parameter Blob (for the result).
     * @param {string} returnedDataType A DOMString indicating the image format. The default type is image/png.
     * @param {number} returnedDataQuality A Number between 0 and 1 indicating image quality if the requested type is image/jpeg or image/webp.
     If this argument is anything else, the default value for image quality is used. Other arguments are ignored.
     */
    generateCanvasBlob(callbackFn: any, returnedDataType: string = "image/png", returnedDataQuality: number = 1) {
        this.context.canvas.toBlob((blob: Blob) => {
            callbackFn && callbackFn(blob);
        }, returnedDataType, returnedDataQuality);
    }

    /**
     * Generate a canvas image representation and download it locally
     * The name of the image is canvas_drawing_ + the current local Date and Time the image was created
     *
     * @param {string} returnedDataType A DOMString indicating the image format. The default type is image/png.
     */
    downloadCanvasImage(returnedDataType: string = "image/png") {
        if (window.navigator.msSaveOrOpenBlob === undefined) {
            let downloadLink = document.createElement('a');
            downloadLink.setAttribute('href', this.generateCanvasDataUrl(returnedDataType));
            console.log(this._generateDataTypeString(returnedDataType));
            downloadLink.setAttribute('download', "canvas_drawing_" + new Date().valueOf() + this._generateDataTypeString(returnedDataType));
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } else {
            // IE-specific code
            this.generateCanvasBlob((blob: Blob) => {
                window.navigator.msSaveOrOpenBlob(blob, "canvas_drawing_" + new Date().valueOf() + this._generateDataTypeString(returnedDataType));
            }, returnedDataType);
        }
    }

    private _generateDataTypeString(returnedDataType: string) {
        if (returnedDataType) {
            return "." + returnedDataType.split('/')[1];
        }

        return "";
    }


    // get base64 format data from canvas
    public toDataURL(returnedDataType: string = "image/png", returnedDataQuality: number = 1): string {
        return this.context.canvas.toDataURL(returnedDataType, returnedDataQuality);
    }

    // set base64 format data to canvas
    public fromDataURL(imageUrl){
        this._canDraw = false;
        this._imageElement = new Image();
        this._imageElement.addEventListener("load", () => {
            this.context.save();
            this._drawImage(this.context, this._imageElement, 0, 0, this.context.canvas.width, this.context.canvas.height, 0.5, 0.5);
            this.context.restore();
            this.drawMissingUpdates();
            this._canDraw = true;
            this.onImageLoaded.emit(true);
        });
        this._imageElement.src = imageUrl;
    }


}