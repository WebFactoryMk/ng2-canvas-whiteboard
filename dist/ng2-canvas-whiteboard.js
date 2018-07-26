"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@angular/core");
var canvas_whiteboard_component_1 = require("./canvas-whiteboard.component");
var common_1 = require("@angular/common");
var canvas_whiteboard_colorpicker_component_1 = require("./canvas-whiteboard-colorpicker.component");
var canvas_whiteboard_service_1 = require("./canvas-whiteboard.service");
var canvas_whiteboard_shape_service_1 = require("./shapes/canvas-whiteboard-shape.service");
var canvas_whiteboard_component_2 = require("./canvas-whiteboard.component");
exports.CanvasWhiteboardComponent = canvas_whiteboard_component_2.CanvasWhiteboardComponent;
var canvas_whiteboard_update_model_1 = require("./canvas-whiteboard-update.model");
exports.CanvasWhiteboardUpdate = canvas_whiteboard_update_model_1.CanvasWhiteboardUpdate;
var canvas_whiteboard_service_2 = require("./canvas-whiteboard.service");
exports.CanvasWhiteboardService = canvas_whiteboard_service_2.CanvasWhiteboardService;
var canvas_whiteboard_point_1 = require("./canvas-whiteboard-point");
exports.CanvasWhiteboardPoint = canvas_whiteboard_point_1.CanvasWhiteboardPoint;
var canvas_whiteboard_shape_1 = require("./shapes/canvas-whiteboard-shape");
exports.CanvasWhiteboardShape = canvas_whiteboard_shape_1.CanvasWhiteboardShape;
var canvas_whiteboard_shape_options_1 = require("./shapes/canvas-whiteboard-shape-options");
exports.CanvasWhiteboardShapeOptions = canvas_whiteboard_shape_options_1.CanvasWhiteboardShapeOptions;
var canvas_whiteboard_shape_service_2 = require("./shapes/canvas-whiteboard-shape.service");
exports.CanvasWhiteboardShapeService = canvas_whiteboard_shape_service_2.CanvasWhiteboardShapeService;
var rectangle_shape_1 = require("./shapes/rectangle-shape");
exports.RectangleShape = rectangle_shape_1.RectangleShape;
var circle_shape_1 = require("./shapes/circle-shape");
exports.CircleShape = circle_shape_1.CircleShape;
var CanvasWhiteboardModule = (function () {
    function CanvasWhiteboardModule() {
    }
    return CanvasWhiteboardModule;
}());
CanvasWhiteboardModule = __decorate([
    core_1.NgModule({
        imports: [
            common_1.CommonModule
        ],
        declarations: [
            canvas_whiteboard_colorpicker_component_1.CanvasWhiteboardColorPickerComponent,
            canvas_whiteboard_component_1.CanvasWhiteboardComponent
        ],
        providers: [
            canvas_whiteboard_service_1.CanvasWhiteboardService,
            canvas_whiteboard_shape_service_1.CanvasWhiteboardShapeService
        ],
        exports: [canvas_whiteboard_component_1.CanvasWhiteboardComponent]
    })
], CanvasWhiteboardModule);
exports.CanvasWhiteboardModule = CanvasWhiteboardModule;
//# sourceMappingURL=ng2-canvas-whiteboard.js.map