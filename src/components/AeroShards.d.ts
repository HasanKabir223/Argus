import React from 'react';

export interface AeroShardsProps {
  backgroundColor?: string;
  shardColor?: string;
  accentColor?: string;
  placement?: 'right' | 'left' | 'center' | 'full';
  flow?: 'stream' | 'ribbon' | 'vortex' | 'wave';
  material?: 'pearl' | 'chrome' | 'matte' | 'glass';
  detail?: 'low' | 'balanced' | 'high';
  effect?: 'none' | 'distort' | 'glitch';
  scale?: number;
  spread?: number;
  depth?: number;
  speed?: number;
  spin?: number;
  interaction?: 'repel' | 'attract' | 'none';
  density?: number;
  shardSize?: number;
  stretch?: number;
  turbulence?: number;
  glow?: number;
  edgeSoftness?: number;
  bloom?: number;
  grain?: number;
  chromaticAberration?: number;
  transitionDuration?: number;
  interactionRadius?: number;
  interactionStrength?: number;
  rippleIntensity?: number;
  holdToGather?: boolean;
}

declare const AeroShards: React.FC<AeroShardsProps>;
export default AeroShards;
