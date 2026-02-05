import { globalBus } from './eventBus.js';
import { gameState } from './model.js';

export const PHASES = {
    ROLL: 'PHASE_ROLL',
    ACTION: 'PHASE_ACTION',
    END: 'PHASE_END',
    GAME_OVER: 'PHASE_GAME_OVER'
};

class GameStateMachine {
    constructor(state) {
        this.state = state;
        this.currentPhase = PHASES.ROLL;
    }

    transitionTo(newPhase) {
        this._onExit(this.currentPhase);
        this.currentPhase = newPhase;
        if (this.state) this.state.phase = newPhase;
        this._onEnter(newPhase);
    }

    _onEnter(phase) {
        switch (phase) {
            case PHASES.ROLL:
                gameState.players.p1.hasEndedRound = false;
                gameState.players.p2.hasEndedRound = false;
                globalBus.emit('CMD_ROLL_DICE_PHASE');
                break;
            case PHASES.ACTION: {
                const firstPlayerId = gameState.players.p1.isFirst ? 'p1' : 'p2';
                gameState.activePlayerId = firstPlayerId;
                if (firstPlayerId === 'p2') {
                    globalBus.emit('CMD_OPPONENT_ACT');
                }
                break;
            }
            case PHASES.END:
                globalBus.emit('CMD_END_PHASE_SETTLEMENT');
                break;
            case PHASES.GAME_OVER:
                break;
        }
    }

    _onExit() {}
}

export const gameFSM = new GameStateMachine(gameState);

