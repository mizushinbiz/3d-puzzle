import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game } from './game.js';
import { CPU } from './cpu.js';

let scene, camera, renderer, controls;
let game, cpu;
let gameMode = 'pvp'; // 'pvp' or 'pvc'
let poles = [];
let poleObjects = []; // 透明度変更用の実体
let blocks = []; // { mesh, player } のリスト
let previewMesh = null;
let currentPreview = null; // {x, z, y}
let isProcessingTurn = false;

let hoverPreviewMesh = null;
let hoveredPole = null; // {x, z}
let walls; // 壁グループの参照

// カメラ初期位置の定数
const INITIAL_CAMERA_POS = new THREE.Vector3(10, 8, 10);
const INITIAL_TARGET = new THREE.Vector3(2.5, 3, 2.5);

// カメラ操作状態
const activeActions = {
  rotateLeft: false,
  rotateRight: false,
  rotateUp: false,
  rotateDown: false,
  panLeft: false,
  panRight: false,
  panUp: false,
  panDown: false,
  zoomIn: false,
  zoomOut: false
};

// マテリアルの定義
const matP1 = new THREE.MeshLambertMaterial({ color: 0x007AFF }); // スタイリッシュな青
const matP2 = new THREE.MeshLambertMaterial({ color: 0xFF3B30 }); // スタイリッシュな赤
const matPreview = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
const hoverMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
const matBase = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });

const blockGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 6.2, 8); // 棒を細く長く
const capGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8); // 先端のキャップ（棒と同じ太さ）

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(10, 8, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(2.5, 3, 2.5);
  controls.update();

  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(10, 20, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  // 土台
  const baseGeo = new THREE.BoxGeometry(6.5, 0.5, 6.5);
  const baseMesh = new THREE.Mesh(baseGeo, matBase);
  baseMesh.position.set(2.5, -0.7, 2.5);
  scene.add(baseMesh);

  // 床のグリッド
  const gridY = new THREE.GridHelper(6, 6, 0x555555, 0x555555);
  gridY.position.set(2.5, -0.44, 2.5); // 土台表面の少し上
  scene.add(gridY);

  // 壁と壁グリッド（4面）
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const wallGeo = new THREE.PlaneGeometry(6, 6);
  
  function createWall(posX, posZ, isXWall, gridOffset) {
    const group = new THREE.Group();
    const plane = new THREE.Mesh(wallGeo, wallMat);
    const grid = new THREE.GridHelper(6, 6, 0x555555, 0x555555);
    
    if (isXWall) {
      plane.rotation.y = Math.PI / 2;
      plane.position.set(posX, 2.5, posZ);
      grid.rotation.z = Math.PI / 2;
      grid.position.set(posX + gridOffset, 2.5, posZ);
    } else {
      plane.position.set(posX, 2.5, posZ);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(posX, 2.5, posZ + gridOffset);
    }
    
    group.add(plane);
    group.add(grid);
    scene.add(group);
    return group;
  }

  // 4つの壁を作成（gridOffsetは内側に向かう方向）
  walls = {
    xMin: createWall(-0.5, 2.5, true, 0.02), // 右向き(+x方向)
    xMax: createWall(5.5, 2.5, true, -0.02), // 左向き(-x方向)
    zMin: createWall(2.5, -0.5, false, 0.02),// 手前向き(+z方向)
    zMax: createWall(2.5, 5.5, false, -0.02) // 奥向き(-z方向)
  };

  // ポールの配置
  for (let x = 0; x < 6; x++) {
    for (let z = 0; z < 6; z++) {
      const pMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.2 });
      const pole = new THREE.Mesh(poleGeometry, pMat);
      // y=2.5の場合、上端は2.5 + 3.1 = 5.6
      pole.position.set(x, 2.5, z);
      
      const cMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
      const cap = new THREE.Mesh(capGeometry, cMat);
      // 上端に乗せる
      cap.position.set(x, 5.65, z);

      // 当たり判定を大きくするため、見えない太めのシリンダーを置く
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6.3, 8), hitMat);
      hitMesh.position.set(x, 2.5, z);

      hitMesh.userData = { x, z }; // クリック判定用

      pole.userData = { x, z, type: 'pole', mat: pMat, capMat: cMat };
      cap.userData = { x, z, type: 'cap', mat: pMat, capMat: cMat };

      scene.add(pole);
      scene.add(cap);
      scene.add(hitMesh);
      
      // poles配列には判定用のhitMeshのみを入れる
      poles.push(hitMesh);
      // ただし透明度操作用にすべてのポールとキャップを別の配列に入れる
      poleObjects.push(pole, cap);
    }
  }

  // イベントリスナー
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);

  document.getElementById('btn-pvp').addEventListener('click', () => startGame('pvp'));
  document.getElementById('btn-pvc').addEventListener('click', () => startGame('pvc'));
  document.getElementById('btn-decide').addEventListener('click', onDecide);
  document.getElementById('btn-cancel').addEventListener('click', clearPreview);
  document.getElementById('btn-restart').addEventListener('click', resetGame);

  // カメラ操作の初期化
  setupCameraControls();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame(mode) {
  gameMode = mode;
  document.getElementById('start-menu').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');
  resetGame();
}

function resetGame() {
  game = new Game();
  if (gameMode === 'pvc') {
    cpu = new CPU(game, 2);
  }
  
  blocks.forEach(b => scene.remove(b.mesh));
  blocks = [];
  clearPreview();
  hoveredPole = null;
  if(hoverPreviewMesh) hoverPreviewMesh.visible = false;
  
  isProcessingTurn = false;
  document.getElementById('result-panel').classList.add('hidden');
  updateUI();
  updatePolesVisibility();
}

function onPointerMove(event) {
  // 決定待ち(currentPreview != null)の場合や、処理中・終了時はホバープレビューを出さない
  if (isProcessingTurn || game.isGameOver || currentPreview !== null) {
    if (hoveredPole) {
      hoveredPole = null;
      if (hoverPreviewMesh) hoverPreviewMesh.visible = false;
      updatePolesVisibility();
    }
    return;
  }
  if (gameMode === 'pvc' && game.currentPlayer === 2) return;

  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(poles);
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    const { x, z } = obj.userData;
    
    if (!hoveredPole || hoveredPole.x !== x || hoveredPole.z !== z) {
      hoveredPole = { x, z };
      showHoverPreview(x, z);
      updatePolesVisibility();
    }
  } else {
    if (hoveredPole !== null) {
      hoveredPole = null;
      if (hoverPreviewMesh) hoverPreviewMesh.visible = false;
      updatePolesVisibility();
    }
  }
}

function showHoverPreview(x, z) {
  const y = game.getDropY(x, z);
  if (y === -1) {
    if (hoverPreviewMesh) hoverPreviewMesh.visible = false;
    return;
  }

  if (!hoverPreviewMesh) {
    hoverPreviewMesh = new THREE.Mesh(blockGeometry, hoverMat);
    scene.add(hoverPreviewMesh);
  }
  
  hoverPreviewMesh.position.set(x, y, z);
  hoverPreviewMesh.visible = true;
  hoverPreviewMesh.material.color.setHex(game.currentPlayer === 1 ? 0x007AFF : 0xFF3B30);
}

function updatePolesVisibility() {
  const selX = currentPreview ? currentPreview.x : -1;
  const selZ = currentPreview ? currentPreview.z : -1;
  
  const hovX = hoveredPole ? hoveredPole.x : -1;
  const hovZ = hoveredPole ? hoveredPole.z : -1;

  // 選択もホバーもなければ全表示（または全て薄くするか？要望は「カーソルが合わさっている棒以外の棒を薄くして視認性を高める」）
  // 選択かホバーのどちらかがあれば、それ以外を薄くする。両方なければ全て通常。
  const activeMode = (selX !== -1 || hovX !== -1);

  poleObjects.forEach(obj => {
    const { x, z, type, mat, capMat } = obj.userData;
    const isTarget = (x === selX && z === selZ) || (x === hovX && z === hovZ);
    const targetMat = type === 'pole' ? mat : capMat;
    
    if (!activeMode || isTarget) {
      targetMat.transparent = true;
      targetMat.opacity = type === 'pole' ? 0.2 : 1.0;
    } else {
      targetMat.transparent = true;
      targetMat.opacity = type === 'pole' ? 0.05 : 0.1; // キャップも透明に、棒(0.05)ほどではない(0.1)
    }
  });
}

function onPointerDown(event) {
  if (isProcessingTurn || game.isGameOver) return;
  if (gameMode === 'pvc' && game.currentPlayer === 2) return;

  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(poles);
  if (intersects.length > 0) {
    const pole = intersects[0].object;
    const { x, z } = pole.userData;
    showPreview(x, z);
  }
}

function showPreview(x, z) {
  const y = game.getDropY(x, z);
  if (y === -1) return; 

  if (!previewMesh) {
    previewMesh = new THREE.Mesh(blockGeometry, matPreview);
    scene.add(previewMesh);
  }
  
  previewMesh.position.set(x, y, z);
  previewMesh.visible = true;
  previewMesh.material.color.setHex(game.currentPlayer === 1 ? 0x007AFF : 0xFF3B30);
  
  currentPreview = { x, y, z };
  
  document.getElementById('btn-decide').disabled = false;
  document.getElementById('btn-cancel').disabled = false;
  
  updatePolesVisibility();
}

function clearPreview() {
  if (previewMesh) previewMesh.visible = false;
  currentPreview = null;
  document.getElementById('btn-decide').disabled = true;
  document.getElementById('btn-cancel').disabled = true;
  updatePolesVisibility();
}

function onDecide() {
  if (!currentPreview || isProcessingTurn) return;
  
  placeBlock(currentPreview.x, currentPreview.z);
}

function placeBlock(x, z) {
  isProcessingTurn = true;
  clearPreview();

  const result = game.place(x, z);
  if (!result) {
    isProcessingTurn = false;
    return;
  }

  // ブロックのアニメーション（上から落ちてくる）
  const startY = 8;
  const targetY = result.y;
  
  const mesh = new THREE.Mesh(blockGeometry, game.currentPlayer === 1 ? matP2 : matP1); // place後にcurrentPlayerが入れ替わっているので逆
  // 正確にマテリアルを設定
  const currentP = result.winner ? result.winner : (game.currentPlayer === 1 ? 2 : 1);
  const blockMat = (currentP === 1) ? matP1.clone() : matP2.clone();
  mesh.material = blockMat;
  
  mesh.position.set(x, startY, z);
  scene.add(mesh);
  blocks.push({ mesh, player: currentP, x, y: targetY, z, isReach: false });

  // 簡易アニメーション
  const duration = 30;
  let frame = 0;
  
  function dropAnim() {
    frame++;
    const progress = frame / duration;
    // イージング（バウンス等は省略してシンプルな落下）
    mesh.position.y = startY + (targetY - startY) * (progress * progress);
    
    if (frame < duration) {
      requestAnimationFrame(dropAnim);
    } else {
      mesh.position.y = targetY;
      onBlockPlaced(result);
    }
  }
  dropAnim();
}

function onBlockPlaced(result) {
  updateBlockMaterials();
  updateReachStatus();

  if (result.isGameOver) {
    if (result.winner !== 0 && result.winBlocks) {
      for (let wb of result.winBlocks) {
        const block = blocks.find(b => b.x === wb.x && b.y === wb.y && b.z === wb.z);
        if (block) block.isWinBlock = true;
      }
    }
    
    document.getElementById('result-panel').classList.remove('hidden');
    let text = "引き分け！";
    if (result.winner === 1) text = "プレイヤー1の勝ち！";
    if (result.winner === 2) text = gameMode === 'pvc' ? "CPUの勝ち！" : "プレイヤー2の勝ち！";
    document.getElementById('result-text').innerText = text;
    isProcessingTurn = false;
    return;
  }

  updateUI();
  isProcessingTurn = false;

  if (gameMode === 'pvc' && game.currentPlayer === 2) {
    setTimeout(() => {
      const cpuMove = cpu.think();
      if (cpuMove) placeBlock(cpuMove.x, cpuMove.z);
    }, 500);
  }
}

function updateUI() {
  const turnText = game.currentPlayer === 1 ? "プレイヤー1のターン (青)" : 
                   (gameMode === 'pvc' ? "CPUのターン (赤)" : "プレイヤー2のターン (赤)");
  document.getElementById('turn-indicator').innerText = turnText;
  document.getElementById('turn-indicator').style.color = game.currentPlayer === 1 ? "#007AFF" : "#FF3B30";
}

// 相手のブロックを半透明にする
function updateBlockMaterials() {
  blocks.forEach(b => {
    if (b.player !== game.currentPlayer) {
      if (!b.mesh.material.transparent) {
        b.mesh.material.transparent = true;
        b.mesh.material.needsUpdate = true;
      }
      b.mesh.material.opacity = 0.3;
    } else {
      if (b.mesh.material.transparent) {
        b.mesh.material.transparent = false;
        b.mesh.material.needsUpdate = true;
      }
      b.mesh.material.opacity = 1.0;
    }
  });
}

// リーチ状態の更新
function updateReachStatus() {
  const reachCoords = game.getReachBlocks();
  blocks.forEach(b => b.isReach = false);
  
  for(let rc of reachCoords) {
    const block = blocks.find(b => b.x === rc.x && b.y === rc.y && b.z === rc.z);
    if(block) {
      block.isReach = true;
    }
  }
}

function updateWallVisibility() {
  if (!walls) return;
  const cx = camera.position.x;
  const cz = camera.position.z;
  
  // カメラが中心(2.5)より右にあるなら左壁(xMax)を非表示、奥壁(xMin)を表示
  walls.xMin.visible = (cx > 2.5);
  walls.xMax.visible = (cx <= 2.5);
  
  // カメラが中心より手前にあるなら奥壁(zMin)を表示、手前壁(zMax)を非表示
  walls.zMin.visible = (cz > 2.5);
  walls.zMax.visible = (cz <= 2.5);
}

function animate() {
  requestAnimationFrame(animate);
  updateContinuousCameraControls();
  controls.update();
  
  updateWallVisibility();

  const time = Date.now() * 0.003;
  const flashVal = (Math.sin(time) + 1) / 2; // 0.0 ~ 1.0

  blocks.forEach(b => {
    if (b.isWinBlock) {
      // 勝利ブロックは目立つライムグリーンに変更して強く光らせる
      b.mesh.material.color.setHex(0x39FF14);
      b.mesh.material.emissive.setHex(0x39FF14);
      b.mesh.material.emissiveIntensity = 0.5 + (Math.sin(time * 2) + 1) * 0.25;
      b.mesh.material.transparent = false;
      b.mesh.material.opacity = 1.0;
    } else if (b.isReach && !game.isGameOver) {
      // プレイヤー1(青)はシアン、プレイヤー2(赤)はイエローに光らせる
      // ゲーム終了後はリーチの点滅をなくす
      const flashColor = b.player === 1 ? 0x00FFFF : 0xFFD700;
      b.mesh.material.emissive.setHex(flashColor);
      b.mesh.material.emissiveIntensity = flashVal * 0.8;
    } else {
      b.mesh.material.emissiveIntensity = 0;
    }
  });

  renderer.render(scene, camera);
}

// --- カメラ・視点操作機能 ---

function zoomCamera(delta) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const currentDist = offset.length();
  const factor = 1 - delta;
  const newDist = currentDist * factor;
  
  // 距離制限 (3〜45)
  if (newDist >= 3 && newDist <= 45) {
    offset.multiplyScalar(factor);
    camera.position.addVectors(controls.target, offset);
    controls.update();
  }
}

function rotateCamera(deltaTheta, deltaPhi) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  
  spherical.theta += deltaTheta;
  spherical.phi += deltaPhi;
  
  // ジンバルロック（極付近でのフリップ）防止
  const EPS = 0.05;
  spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));
  
  offset.setFromSpherical(spherical);
  camera.position.addVectors(controls.target, offset);
  controls.update();
}

function panCamera(deltaX, deltaY) {
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.matrix.extractBasis(right, up, new THREE.Vector3());
  
  right.normalize().multiplyScalar(deltaX);
  up.normalize().multiplyScalar(deltaY);
  
  const moveOffset = new THREE.Vector3().addVectors(right, up);
  camera.position.add(moveOffset);
  controls.target.add(moveOffset);
  controls.update();
}

function resetCameraView() {
  camera.position.copy(INITIAL_CAMERA_POS);
  controls.target.copy(INITIAL_TARGET);
  controls.update();
}

function triggerActionOnce(action) {
  const stepRot = Math.PI / 24; // 約7.5度
  const stepPan = 0.45;
  const stepZoom = 0.09;

  switch (action) {
    case 'rotateLeft': rotateCamera(stepRot, 0); break;
    case 'rotateRight': rotateCamera(-stepRot, 0); break;
    case 'rotateUp': rotateCamera(0, -stepRot); break;
    case 'rotateDown': rotateCamera(0, stepRot); break;
    case 'panLeft': panCamera(-stepPan, 0); break;
    case 'panRight': panCamera(stepPan, 0); break;
    case 'panUp': panCamera(0, stepPan); break;
    case 'panDown': panCamera(0, -stepPan); break;
    case 'zoomIn': zoomCamera(stepZoom); break;
    case 'zoomOut': zoomCamera(-stepZoom); break;
  }
}

function updateContinuousCameraControls() {
  const rotSpeed = 0.025;
  const panSpeed = 0.08;
  const zoomSpeed = 0.02;

  if (activeActions.rotateLeft) rotateCamera(rotSpeed, 0);
  if (activeActions.rotateRight) rotateCamera(-rotSpeed, 0);
  if (activeActions.rotateUp) rotateCamera(0, -rotSpeed);
  if (activeActions.rotateDown) rotateCamera(0, rotSpeed);

  if (activeActions.panLeft) panCamera(-panSpeed, 0);
  if (activeActions.panRight) panCamera(panSpeed, 0);
  if (activeActions.panUp) panCamera(0, panSpeed);
  if (activeActions.panDown) panCamera(0, -panSpeed);

  if (activeActions.zoomIn) zoomCamera(zoomSpeed);
  if (activeActions.zoomOut) zoomCamera(-zoomSpeed);
}

function setupCameraControls() {
  const camPanel = document.getElementById('camera-panel');
  if (!camPanel) return;

  // パネル内でのタッチ・クリックが3D盤面に貫通しないようにする
  camPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  camPanel.addEventListener('pointermove', (e) => e.stopPropagation());

  // トグルボタン（最小化・展開）
  const btnToggle = document.getElementById('btn-toggle-cam-panel');
  const panelBody = document.getElementById('camera-panel-body');
  if (btnToggle && panelBody) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      panelBody.classList.toggle('collapsed');
      const isCollapsed = panelBody.classList.contains('collapsed');
      btnToggle.textContent = isCollapsed ? '＋' : '−';
      btnToggle.setAttribute('aria-label', isCollapsed ? 'パネルを展開' : 'パネルを折りたたむ');
    });
  }

  // 初期視点リセットボタン
  const btnReset = document.getElementById('btn-cam-reset');
  if (btnReset) {
    btnReset.addEventListener('click', (e) => {
      e.stopPropagation();
      resetCameraView();
    });
  }

  // アクションボタン（長押し & クリック対応）
  const actionButtons = camPanel.querySelectorAll('[data-action]');
  actionButtons.forEach(btn => {
    const action = btn.getAttribute('data-action');
    if (!action) return;

    const startAction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('is-active');
      activeActions[action] = true;
      triggerActionOnce(action);
    };

    const stopAction = (e) => {
      btn.classList.remove('is-active');
      activeActions[action] = false;
    };

    btn.addEventListener('pointerdown', startAction);
    btn.addEventListener('pointerup', stopAction);
    btn.addEventListener('pointerleave', stopAction);
    btn.addEventListener('pointercancel', stopAction);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // キーボード操作対応
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    for (let key in activeActions) {
      activeActions[key] = false;
    }
    actionButtons.forEach(btn => btn.classList.remove('is-active'));
  });
}

function onKeyDown(e) {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

  const isShift = e.shiftKey;
  let handled = false;

  switch (e.code) {
    // 矢印キー
    case 'ArrowLeft':
      if (isShift) activeActions.panLeft = true;
      else activeActions.rotateLeft = true;
      handled = true;
      break;
    case 'ArrowRight':
      if (isShift) activeActions.panRight = true;
      else activeActions.rotateRight = true;
      handled = true;
      break;
    case 'ArrowUp':
      if (isShift) activeActions.panUp = true;
      else activeActions.rotateUp = true;
      handled = true;
      break;
    case 'ArrowDown':
      if (isShift) activeActions.panDown = true;
      else activeActions.rotateDown = true;
      handled = true;
      break;

    // 位置移動 (WASD)
    case 'KeyW':
      activeActions.panUp = true;
      handled = true;
      break;
    case 'KeyS':
      activeActions.panDown = true;
      handled = true;
      break;
    case 'KeyA':
      activeActions.panLeft = true;
      handled = true;
      break;
    case 'KeyD':
      activeActions.panRight = true;
      handled = true;
      break;

    // 拡大・縮小
    case 'Equal': // Shift + ';' on JIS, '=' on US
    case 'NumpadAdd':
    case 'KeyQ':
    case 'PageUp':
      activeActions.zoomIn = true;
      handled = true;
      break;
    case 'Minus':
    case 'NumpadSubtract':
    case 'KeyE':
    case 'PageDown':
      activeActions.zoomOut = true;
      handled = true;
      break;

    // 初期視点リセット
    case 'KeyR':
    case 'Home':
      resetCameraView();
      handled = true;
      break;
  }

  // JISキーボードや各種キー配列用フォールバック
  if (!handled) {
    if (e.key === '+' || e.key === ';') {
      activeActions.zoomIn = true;
      handled = true;
    } else if (e.key === '-') {
      activeActions.zoomOut = true;
      handled = true;
    } else if (e.key === 'r' || e.key === 'R') {
      resetCameraView();
      handled = true;
    }
  }

  if (handled) {
    e.preventDefault();
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'ArrowLeft':
      activeActions.rotateLeft = false;
      activeActions.panLeft = false;
      break;
    case 'ArrowRight':
      activeActions.rotateRight = false;
      activeActions.panRight = false;
      break;
    case 'ArrowUp':
      activeActions.rotateUp = false;
      activeActions.panUp = false;
      break;
    case 'ArrowDown':
      activeActions.rotateDown = false;
      activeActions.panDown = false;
      break;

    case 'KeyW': activeActions.panUp = false; break;
    case 'KeyS': activeActions.panDown = false; break;
    case 'KeyA': activeActions.panLeft = false; break;
    case 'KeyD': activeActions.panRight = false; break;

    case 'Equal':
    case 'NumpadAdd':
    case 'KeyQ':
    case 'PageUp':
      activeActions.zoomIn = false;
      break;
    case 'Minus':
    case 'NumpadSubtract':
    case 'KeyE':
    case 'PageDown':
      activeActions.zoomOut = false;
      break;
  }

  if (e.key === '+' || e.key === ';') activeActions.zoomIn = false;
  if (e.key === '-') activeActions.zoomOut = false;
}
