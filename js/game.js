export class Game {
  constructor() {
    this.size = 6;
    this.winLength = 4;
    this.reset();
  }

  reset() {
    this.board = [];
    for(let x=0; x<this.size; x++){
      this.board[x] = [];
      for(let y=0; y<this.size; y++){
        this.board[x][y] = [];
        for(let z=0; z<this.size; z++){
          this.board[x][y][z] = 0;
        }
      }
    }
    this.currentPlayer = 1;
    this.isGameOver = false;
    this.winner = 0;
  }

  // (x, z) に落とせる y の高さを返す。満杯なら -1
  getDropY(x, z) {
    for(let y=0; y<this.size; y++){
      if(this.board[x][y][z] === 0) return y;
    }
    return -1;
  }

  // (x, z) に石を落とす
  place(x, z) {
    if(this.isGameOver) return false;
    const y = this.getDropY(x, z);
    if(y === -1) return false;

    this.board[x][y][z] = this.currentPlayer;

    const winBlocks = this.checkWin(x, y, z, this.currentPlayer);
    if(winBlocks.length > 0) {
      this.isGameOver = true;
      this.winner = this.currentPlayer;
      this.winBlocks = winBlocks;
    } else {
      // 盤面が全て埋まったかチェック（引き分け）
      let isDraw = true;
      for(let ix=0; ix<this.size; ix++){
        for(let iz=0; iz<this.size; iz++){
          if(this.getDropY(ix, iz) !== -1) {
            isDraw = false; break;
          }
        }
      }
      if(isDraw) {
        this.isGameOver = true;
        this.winner = 0; // Draw
        this.winBlocks = [];
      } else {
        // ターン切り替え
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      }
    }

    return { x, y, z, isGameOver: this.isGameOver, winner: this.winner, winBlocks: this.winBlocks || [] };
  }

  // 勝利している場合、揃ったブロックの座標配列を返す。勝利していなければ空配列を返す。
  checkWin(cx, cy, cz, player) {
    // 13方向（両側へ伸ばすため、半分の方向のみ定義）
    const directions = [
      [1,0,0], [0,1,0], [0,0,1], // 軸に平行
      [1,1,0], [1,-1,0],         // xy平面斜め
      [1,0,1], [1,0,-1],         // xz平面斜め
      [0,1,1], [0,1,-1],         // yz平面斜め
      [1,1,1], [1,1,-1], [1,-1,1], [1,-1,-1] // 3次元斜め
    ];

    for(let d of directions) {
      let count = 1;
      let blocks = [{x: cx, y: cy, z: cz}];

      // 正の方向へ
      for(let i=1; i<this.winLength; i++) {
        const nx = cx + d[0]*i;
        const ny = cy + d[1]*i;
        const nz = cz + d[2]*i;
        if(this.isValid(nx,ny,nz) && this.board[nx][ny][nz] === player) {
          count++;
          blocks.push({x: nx, y: ny, z: nz});
        }
        else break;
      }
      // 負の方向へ
      for(let i=1; i<this.winLength; i++) {
        const nx = cx - d[0]*i;
        const ny = cy - d[1]*i;
        const nz = cz - d[2]*i;
        if(this.isValid(nx,ny,nz) && this.board[nx][ny][nz] === player) {
          count++;
          blocks.push({x: nx, y: ny, z: nz});
        }
        else break;
      }

      if(count >= this.winLength) return blocks;
    }
    return [];
  }

  isValid(x, y, z) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && z >= 0 && z < this.size;
  }

  // リーチ（4つの連続したマスのうち、3つが同じプレイヤーのブロックで1つが空きマス）
  // となっているブロックの座標の配列を返す。
  getReachBlocks() {
    const reachBlocks = [];
    // 探索する13方向
    const directions = [
      [1,0,0], [0,1,0], [0,0,1],
      [1,1,0], [1,-1,0],
      [1,0,1], [1,0,-1],
      [0,1,1], [0,1,-1],
      [1,1,1], [1,1,-1], [1,-1,1], [1,-1,-1]
    ];

    // 全ての始点と方向について長さ4の直線をチェックする
    for(let x=0; x<this.size; x++) {
      for(let y=0; y<this.size; y++) {
        for(let z=0; z<this.size; z++) {
          for(let d of directions) {
            let p1Count = 0;
            let p2Count = 0;
            let emptyCount = 0;
            let blocksInLine = [];
            let isValidLine = true;

            for(let i=0; i<this.winLength; i++) {
              const nx = x + d[0]*i;
              const ny = y + d[1]*i;
              const nz = z + d[2]*i;
              if(!this.isValid(nx, ny, nz)) {
                isValidLine = false;
                break;
              }
              const val = this.board[nx][ny][nz];
              if(val === 1) p1Count++;
              else if(val === 2) p2Count++;
              else if(val === 0) emptyCount++;

              if(val !== 0) {
                blocksInLine.push({x: nx, y: ny, z: nz});
              }
            }

            if(isValidLine) {
              // どちらかのプレイヤーがリーチ状態 (3個あって1個空き)
              if((p1Count === 3 && emptyCount === 1) || (p2Count === 3 && emptyCount === 1)) {
                for(let b of blocksInLine) {
                  reachBlocks.push(b);
                }
              }
            }
          }
        }
      }
    }

    // 重複を削除して返す
    const unique = [];
    const seen = new Set();
    for(let b of reachBlocks) {
      const key = `${b.x},${b.y},${b.z}`;
      if(!seen.has(key)) {
        seen.add(key);
        unique.push(b);
      }
    }
    return unique;
  }
}
