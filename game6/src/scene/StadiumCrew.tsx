import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { animateBeast, createBeast, type BeastMode, type BeastRig, type HatKind } from './beast';
import { ST } from '../stadium/dims';
import type { AssetHandle } from '../assets/common';

type Phase = 'play' | 'shot' | 'goal' | 'reset';

interface Player {
  rig: BeastRig;
  team: 1 | -1;
  off: [number, number];
  home: [number, number];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function StadiumCrew({ asset }: { asset: AssetHandle }) {
  const ball = asset.ball;
  const match = asset.match;
  const by = ST.pitchY + ST.ballR;

  const cast = useMemo(() => {
    const mk = (color: string, hat: HatKind = 'none') => createBeast(color, hat);
    const players: Player[] = [];
    const defs: [1 | -1, string, [number, number], [number, number]][] = [
      [1, '#ff6b6b', [-2.6, 0.4], [-3, 0]],
      [1, '#ff8787', [-6.5, 4.2], [-8, 5]],
      [1, '#fa5252', [-6.5, -4.2], [-8, -5]],
      [-1, '#4dabf7', [2.6, -0.4], [3, 0]],
      [-1, '#74c0fc', [6.5, -4.2], [8, -5]],
      [-1, '#339af0', [6.5, 4.2], [8, 5]],
    ];
    defs.forEach(([team, color, off, home], i) => {
      players.push({
        rig: mk(color, i % 3 === 0 ? 'party' : 'none'),
        team,
        off,
        home,
        pos: new THREE.Vector3(home[0], ST.pitchY, home[1]),
        vel: new THREE.Vector3(),
        phase: i * 0.7,
      });
    });
    const keepers = [mk('#ffd43b', 'sailor'), mk('#69db7c', 'sailor')];
    const referee = mk('#2b2f36', 'captain');
    const mascot = mk('#ff7a3d', 'party');
    mascot.root.scale.setScalar(3.2);
    mascot.root.position.set(36.6, ST.deckY, 15);
    mascot.root.rotation.y = Math.PI / 2;
    const brawlA = mk('#b197fc');
    const brawlB = mk('#63e6be');
    brawlA.root.position.set(37.2, ST.deckY, 26.6);
    brawlA.root.rotation.y = Math.atan2(1.4, -0.4);
    brawlB.root.position.set(38.6, ST.deckY, 26.2);
    brawlB.root.rotation.y = Math.atan2(-1.4, 0.4);
    return { players, keepers, referee, mascot, brawlA, brawlB };
  }, []);

  const all = useMemo(
    () => [...cast.players.map((p) => p.rig), ...cast.keepers, cast.referee, cast.mascot, cast.brawlA, cast.brawlB],
    [cast],
  );

  useEffect(
    () => () => {
      all.forEach((r) => r.dispose());
      if (ball) {
        ball.position.set(0, by, 0);
        ball.quaternion.identity();
      }
      if (match) match.flash = 0;
    },
    [all, ball, match, by],
  );

  const sim = useRef({
    phase: 'play' as Phase,
    time: 0,
    dur: 8,
    side: 1 as 1 | -1,
    pos: new THREE.Vector3(0, by, 0),
    prev: new THREE.Vector3(0, by, 0),
    vel: new THREE.Vector3(),
    target: new THREE.Vector2(4, 2),
    retarget: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    keeperZ: [0, 0],
    refPos: new THREE.Vector3(0, ST.pitchY, 7),
  });
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), axis: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((state, dtRaw) => {
    if (!ball || !match) return;
    const dt = Math.min(dtRaw, 1 / 30);
    const t = state.clock.elapsedTime;
    const s = sim.current;
    s.time += dt;
    match.clock += dt;
    s.prev.copy(s.pos);

    if (s.phase === 'play') {
      s.retarget -= dt;
      if (s.retarget <= 0) {
        const prog = Math.min(1, s.time / s.dur);
        s.target.set(clamp(s.side * (Math.random() * 12 - 3 + prog * 6), -16, 16), Math.random() * 18 - 9);
        s.retarget = 1.2 + Math.random() * 0.6;
      }
      tmp.d.set(s.target.x - s.pos.x, 0, s.target.y - s.pos.z);
      const dist = tmp.d.length();
      if (dist > 0.01) tmp.d.multiplyScalar(Math.min(5.5, dist * 1.6) / dist);
      s.vel.lerp(tmp.d, Math.min(1, dt * 2.2));
      s.pos.addScaledVector(s.vel, dt);
      s.pos.x = clamp(s.pos.x, -18, 18);
      s.pos.z = clamp(s.pos.z, -11.5, 11.5);
      s.pos.y = by;
      if (s.time > s.dur) {
        s.phase = 'shot';
        s.time = 0;
        s.from.copy(s.pos);
        s.to.set(s.side * (ST.pitchHX + 1.1), by, (Math.random() - 0.5) * 3.4);
      }
    } else if (s.phase === 'shot') {
      const k = Math.min(1, s.time / 0.9);
      const e = 1 - (1 - k) * (1 - k);
      s.pos.lerpVectors(s.from, s.to, e);
      s.pos.y = by + Math.sin(Math.PI * k) * 1.1;
      if (k >= 1) {
        s.phase = 'goal';
        s.time = 0;
        if (s.side === 1) match.home++;
        else match.away++;
        match.flash = 1;
      }
    } else if (s.phase === 'goal') {
      s.pos.copy(s.to);
      if (s.time > 2.8) {
        s.phase = 'reset';
        s.time = 0;
        match.flash = 0;
        s.from.copy(s.pos);
        s.to.set(0, by, 0);
      }
    } else {
      const k = Math.min(1, s.time / 1.4);
      s.pos.lerpVectors(s.from, s.to, k);
      s.pos.y = by + Math.sin(Math.PI * k) * 5;
      if (k >= 1) {
        s.phase = 'play';
        s.time = 0;
        s.dur = 7 + Math.random() * 4;
        s.side = (s.side * -1) as 1 | -1;
        s.vel.set(0, 0, 0);
        s.retarget = 0;
      }
    }

    // gelinding bola
    tmp.d.subVectors(s.pos, s.prev);
    tmp.d.y = 0;
    const moved = tmp.d.length();
    if (moved > 1e-5) {
      tmp.axis.set(tmp.d.z, 0, -tmp.d.x).normalize();
      tmp.q.setFromAxisAngle(tmp.axis, moved / ST.ballR);
      ball.quaternion.premultiply(tmp.q);
    }
    ball.position.copy(s.pos);

    // pemain
    const celebrating = s.phase === 'goal';
    const scoringTeam = s.side;
    for (const p of cast.players) {
      let tx: number;
      let tz: number;
      if (s.phase === 'reset' || celebrating) {
        tx = celebrating && p.team === scoringTeam ? p.pos.x : p.home[0];
        tz = celebrating && p.team === scoringTeam ? p.pos.z : p.home[1];
      } else {
        tx = s.pos.x + p.off[0];
        tz = s.pos.z + p.off[1];
      }
      tx = clamp(tx, -19, 19);
      tz = clamp(tz, -12.5, 12.5);
      tmp.d.set(tx - p.pos.x, 0, tz - p.pos.z);
      const dist = tmp.d.length();
      const speed = dist > 0.6 ? Math.min(4.6, dist * 2) : 0;
      if (dist > 1e-4) tmp.d.multiplyScalar(speed / dist);
      p.vel.lerp(tmp.d, Math.min(1, dt * 4));
      p.pos.addScaledVector(p.vel, dt);
      const v = p.vel.length();
      const nearBall = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) < 1.9;
      let mode: BeastMode = 'idle';
      if (celebrating) mode = p.team === scoringTeam ? 'dance' : 'idle';
      else if (nearBall && s.phase === 'play') mode = 'punch';
      else if (v > 0.35) mode = 'walk';
      p.rig.root.position.set(p.pos.x, ST.pitchY, p.pos.z);
      if (v > 0.2) p.rig.root.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      else if (nearBall) p.rig.root.rotation.y = Math.atan2(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      animateBeast(p.rig, mode, t * (mode === 'walk' ? 0.6 + v * 0.18 : 1) + p.phase);
    }

    // kiper
    cast.keepers.forEach((k, i) => {
      const side = i === 0 ? 1 : -1;
      s.keeperZ[i] += (clamp(s.pos.z, -2.0, 2.0) - s.keeperZ[i]) * Math.min(1, dt * 3);
      k.root.position.set(side * (ST.pitchHX - 0.8), ST.pitchY, s.keeperZ[i]);
      k.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const near = Math.abs(s.pos.x - side * ST.pitchHX) < 9;
      animateBeast(k, near ? 'wave' : 'idle', t + i);
    });

    // wasit
    const rtx = clamp(s.pos.x * 0.8, -16, 16);
    const rtz = clamp(s.pos.z > 0 ? s.pos.z - 7 : s.pos.z + 7, -12, 12);
    tmp.d.set(rtx - s.refPos.x, 0, rtz - s.refPos.z);
    const rd = tmp.d.length();
    if (rd > 0.5) {
      tmp.d.multiplyScalar(Math.min(3.5, rd) / rd);
      s.refPos.addScaledVector(tmp.d, dt);
      cast.referee.root.rotation.y = Math.atan2(tmp.d.x, tmp.d.z);
      animateBeast(cast.referee, 'walk', t * 0.9);
    } else {
      cast.referee.root.rotation.y = Math.atan2(s.pos.x - s.refPos.x, s.pos.z - s.refPos.z);
      animateBeast(cast.referee, celebrating ? 'wave' : 'idle', t);
    }
    cast.referee.root.position.set(s.refPos.x, ST.pitchY, s.refPos.z);

    animateBeast(cast.mascot, 'wave', t * 0.8);
    animateBeast(cast.brawlA, 'punch', t);
    animateBeast(cast.brawlB, 'punch', t + 0.26);
  });

  return (
    <group>
      {all.map((r, i) => (
        <primitive key={i} object={r.root} dispose={null} />
      ))}
    </group>
  );
}
