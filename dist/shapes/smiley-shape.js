"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var canvas_whiteboard_shape_1 = require("./canvas-whiteboard-shape");
var SmileyShape = (function (_super) {
    __extends(SmileyShape, _super);
    function SmileyShape(positionPoint, options, radius) {
        var _this = _super.call(this, positionPoint, options) || this;
        options.shouldFillShape = true;
        options.fillStyle = "yellow";
        _this.radius = radius;
        return _this;
    }
    SmileyShape.prototype.draw = function (context) {
        console.log(this);
        context.save();
        context.beginPath();
        context.arc(this.positionPoint.x, this.positionPoint.y, this.radius, 0, Math.PI * 2, false);
        context.fillStyle = this.options.fillStyle;
        context.fill();
        context.lineWidth = this.options.lineWidth;
        context.strokeStyle = this.options.strokeStyle;
        context.stroke();
        context.beginPath();
        var leftEyeX = this.positionPoint.x - this.radius * 0.3;
        var rightEyeX = this.positionPoint.x + this.radius * 0.3;
        var eyesY = this.positionPoint.y - this.radius * 0.2;
        var eyeSize = this.radius * 0.1;
        context.arc(leftEyeX, eyesY, eyeSize, 0, 2 * Math.PI, false);
        context.arc(rightEyeX, eyesY, eyeSize, 0, 2 * Math.PI, false);
        context.fillStyle = 'black';
        context.fill();
        // draw the mouth
        context.beginPath();
        context.arc(this.positionPoint.x, this.positionPoint.y, this.radius * 0.7, 0, Math.PI, false);
        context.stroke();
        context.closePath();
        context.restore();
    };
    SmileyShape.prototype.onUpdateReceived = function (update) {
        this.radius = Math.sqrt(Math.pow(update.x - this.positionPoint.x, 2) + Math.pow(update.y - this.positionPoint.y, 2));
    };
    SmileyShape.prototype.onStopReceived = function (update) {
    };
    return SmileyShape;
}(canvas_whiteboard_shape_1.CanvasWhiteboardShape));
exports.SmileyShape = SmileyShape;
//# sourceMappingURL=smiley-shape.js.map