export class CPU {
  constructor(game, cpuPlayerId) {
    this.game = game;
    this.cpuPlayerId = cpuPlayerId; // 2
    this.humanPlayerId = cpuPlayerId === 1 ? 2 : 1;
  }

  // CPUの手を決定し、{x, z} を返す
  think() {
    const validMoves = [];
    const size = this.game.size;

    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const y = this.game.getDropY(x, z);
        if (y !== -1) {
          validMoves.push({ x, y, z });
        }
      }
    }

    if (validMoves.length === 0) return null;

    // 1. 自分が勝てる手を探す
    for (let move of validMoves) {
      this.game.board[move.x][move.y][move.z] = this.cpuPlayerId;
      if (this.game.checkWin(move.x, move.y, move.z, this.cpuPlayerId)) {
        this.game.board[move.x][move.y][move.z] = 0; // 戻す
        return { x: move.x, z: move.z };
      }
      this.game.board[move.x][move.y][move.z] = 0; // 戻す
    }

    // 2. 相手が勝つ手を防ぐ
    for (let move of validMoves) {
      this.game.board[move.x][move.y][move.z] = this.humanPlayerId;
      if (this.game.checkWin(move.x, move.y, move.z, this.humanPlayerId)) {
        this.game.board[move.x][move.y][move.z] = 0; // 戻す
        return { x: move.x, z: move.z };
      }
      this.game.board[move.x][move.y][move.z] = 0; // 戻す
    }

    // 3. ランダムに選ぶ
    const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    return { x: randomMove.x, z: randomMove.z };
  }
}
