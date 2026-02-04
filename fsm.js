// fsm.js
// 有限状态机：控制游戏回合流程
import { globalBus } from './eventBus.js';
import { gameState } from './model.js';

export const PHASES = {
    ROLL: 'PHASE_ROLL',            // 投骰子阶段
    ACTION_IDLE: 'PHASE_ACTION_IDLE', // 玩家行动阶段
    OPPONENT_TURN: 'PHASE_OPPONENT_TURN', // 对手行动阶段
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
                console.log(">>> 进入投掷阶段，生成骰子...");
                globalBus.emit('CMD_ROLL_DICE', { count: 8 });
                break;
            case PHASES.ACTION_IDLE:
                console.log(">>> 轮到玩家行动");
                break;
            case PHASES.OPPONENT_TURN:
                console.log(">>> 轮到对手行动，AI思考中...");
                globalBus.emit('CMD_OPPONENT_ACT'); // 触发AI逻辑
                break;
            case PHASES.GAME_OVER:
                console.log(">>> 游戏结束");
                break;
        }
    }

    _onExit(phase) {}
}

export const gameFSM = new GameStateMachine(gameState);