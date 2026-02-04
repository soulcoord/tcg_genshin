// fsm.js
// 有限状态机：控制游戏回合流程
import { globalBus } from './eventBus.js';
import { gameState } from './model.js';

export const PHASES = {
    ROLL: 'PHASE_ROLL',            // 投骰子阶段
    ACTION: 'PHASE_ACTION',        // 行动阶段 (双方轮流)
    END: 'PHASE_END',              // 结束阶段 (结算)
    GAME_OVER: 'PHASE_GAME_OVER'   // 游戏结束
};

class GameStateMachine {
    constructor(state) {
        this.state = state;
        this.currentPhase = PHASES.ROLL;
    }

    transitionTo(newPhase) {
        console.log(`[状态机] 状态切换: ${this.currentPhase} -> ${newPhase}`);
        
        this._onExit(this.currentPhase);
        this.currentPhase = newPhase;
        if (this.state) this.state.phase = newPhase;
        this._onEnter(newPhase);
    }

    _onEnter(phase) {
        switch (phase) {
            case PHASES.ROLL:
                console.log(`>>> 第 ${gameState.roundNumber} 回合开始: 投掷阶段`);
                // 重置玩家状态
                gameState.players.p1.hasEndedRound = false;
                gameState.players.p2.hasEndedRound = false;

                // 触发投骰子 (双方都投，这里简化为系统指令)
                globalBus.emit('CMD_ROLL_DICE_PHASE');
                break;

            case PHASES.ACTION:
                console.log(">>> 进入行动阶段");
                // 确定谁先手
                const firstPlayerId = gameState.players.p1.isFirst ? 'p1' : 'p2';
                gameState.activePlayerId = firstPlayerId;
                console.log(`>>> 先手玩家: ${firstPlayerId === 'p1' ? '玩家' : '对手'}`);

                // 如果是对手先手，触发AI
                if (firstPlayerId === 'p2') {
                    globalBus.emit('CMD_OPPONENT_ACT');
                }
                break;

            case PHASES.END:
                console.log(">>> 进入结束阶段");
                globalBus.emit('CMD_END_PHASE_SETTLEMENT');
                break;

            case PHASES.GAME_OVER:
                console.log(">>> 游戏结束");
                break;
        }
    }

    _onExit(phase) {}
}

export const gameFSM = new GameStateMachine(gameState);
