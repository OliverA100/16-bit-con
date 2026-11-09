/**
 * Sam's sheets, loaded once and brand-corrected. The state machine that
 * drives him on the timeline arrives in Phase 3; this module only owns the assets.
 */
import { sprites } from '../data/sprites.manifest';
import { loadImage, makeStrip, type Strip } from './sprites';
import { remap, SAM_BRAND_MAP } from './palette';

export interface SamSheets {
  run: Strip;
  jump: Strip;
  idle: Strip;
  propeller: Strip;
}

export async function loadSamSheets(): Promise<SamSheets> {
  const [run, jump, idle, propeller] = await Promise.all([
    loadImage(sprites.samRun.file),
    loadImage(sprites.samJump.file),
    loadImage(sprites.samIdle.file),
    loadImage(sprites.samPropeller.file),
  ]);
  return {
    run: makeStrip(remap(run, SAM_BRAND_MAP)),
    jump: makeStrip(remap(jump, SAM_BRAND_MAP)),
    idle: makeStrip(remap(idle, SAM_BRAND_MAP)),
    propeller: makeStrip(propeller),
  };
}
