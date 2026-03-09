import { VisualizerMode, VisualizerSettings } from "../../types";
import {
  drawBars,
  drawLine,
  drawCircle,
  drawDualBars,
  drawRipple,
  drawPixel,
  drawRoundedBars,
  drawStarburst,
  drawButterfly,
  drawAurora,
  drawSpectrum,
  drawDotWave,
  drawLedBars,
  drawFluid,
  drawParticleSpectrum,
  drawJellyWave,
  drawPulseCircles,
  drawFlowerPetals,
  drawSmoothLine,
  drawSymmetricWave,
  drawMonstercat,
} from "../../utils/draw";

export const renderSpectrum = (
  visualizerMode: VisualizerMode | null,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dataArray: Uint8Array,
  w: number,
  h: number,
  scaledSettings: VisualizerSettings,
  timestamp: number,
) => {
  if (!visualizerMode) return;
  switch (visualizerMode) {
    case VisualizerMode.BARS:
      drawBars(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.WAVE:
      drawLine(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.CIRCULAR:
      drawCircle(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.DUAL_BARS:
      drawDualBars(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.RIPPLE:
      drawRipple(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.PIXEL:
      drawPixel(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.ROUNDED_BARS:
      drawRoundedBars(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.STARBURST:
      drawStarburst(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.BUTTERFLY:
      drawButterfly(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.AURORA:
      drawAurora(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.SPECTRUM:
      drawSpectrum(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.DOT_WAVE:
      drawDotWave(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.LED_BARS:
      drawLedBars(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.FLUID:
      drawFluid(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.PARTICLES:
      drawParticleSpectrum(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.JELLY_WAVE:
      drawJellyWave(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.PULSE_CIRCLES:
      drawPulseCircles(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.FLOWER_PETALS:
      drawFlowerPetals(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.SMOOTH_LINE:
      drawSmoothLine(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.SYMMETRIC_WAVE:
      drawSymmetricWave(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    case VisualizerMode.MONSTERCAT:
      drawMonstercat(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
    default:
      drawBars(context, dataArray, dataArray.length, w, h, scaledSettings, timestamp);
      break;
  }
};
