import { EventEmitter, OnInit, ElementRef } from '@angular/core';
export declare class CanvasWhiteboardColorPickerComponent implements OnInit {
    private _elementRef;
    selectedColor: string;
    canvas: ElementRef;
    showColorPicker: boolean;
    private _context;
    onColorSelected: EventEmitter<string>;
    constructor(_elementRef: ElementRef);
    /**
     * Initialize the canvas drawing context. If we have an aspect ratio set up, the canvas will resize
     * according to the aspect ratio.
     */
    ngOnInit(): void;
    createColorPalette(): void;
    closeOnExternalClick(event: any): void;
    toggleColorPicker(event: any): void;
    private _getColor(event);
    selectColor(event: any): void;
}
