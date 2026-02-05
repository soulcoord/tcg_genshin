// main.js
// 游戏主控制器：负责逻辑组装和循环控制
import { initView } from './view.js';
import { gameFSM, PHASES } from './fsm.js';
import { globalBus } from './eventBus.js';
import { DamagePipeline } from './damagePipeline.js';
import { rollDice } from './dice.js';
import { gameState } from './model.js';
import { CostValidator } from './costValidator.js';
import { GameMechanics } from './gameMechanics.js';
import { CONSTANTS } from './constants.js';

console.log(">>> 游戏引擎启动中...");
initView();

// 游戏初始化流程
setTimeout(() => {
    console.log(">>> 游戏开始，抽取初始手牌 (5张)");
    GameMechanics.drawCards(gameState.players.p1, 5);
    GameMechanics.drawCards(gameState.players.p2, 5);

    // 进入第一回合投掷阶段
    gameFSM.transitionTo(PHASES.ROLL);
}, 1000);

// --- 辅助函数：切换回合逻辑 ---
function handleTurnSwitch(isCombatAction) {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    const currentId = gameState.activePlayerId;
    const nextId = currentId === 'p1' ? 'p2' : 'p1';

    // 1. 如果是快速行动，回合权不变
    if (!isCombatAction) {
        console.log(">>> 快速行动，继续保持控制权");
        return;
    }

    // 2. 如果是战斗行动，尝试移交回合
    console.log(">>> 战斗行动结束，切换控制权...");

    // 检查下一位玩家是否已结束回合
    if (gameState.players[nextId].hasEndedRound) {
        if (gameState.players[currentId].hasEndedRound) {
            // 双方都结束 -> 进入结束阶段
            gameFSM.transitionTo(PHASES.END);
        } else {
            // 对手已结束，控制权回到自己（连动）
            console.log(`>>> ${nextId === 'p1' ? '玩家' : '对手'} 已结束回合，继续行动`);
            // 如果是 AI 连动，需要再次触发
            if (currentId === 'p2') setTimeout(() => globalBus.emit('CMD_OPPONENT_ACT'), 1000);
        }
    } else {
        // 正常切换
        gameState.activePlayerId = nextId;
        console.log(`>>> 轮到 ${nextId === 'p1' ? '玩家' : '对手'}`);
        if (nextId === 'p2') {
            globalBus.emit('CMD_OPPONENT_ACT');
        }
    }
}

// --- 核心事件处理 ---

// 1. 投骰子阶段
globalBus.on('CMD_ROLL_DICE_PHASE', () => {
    // 双方投骰子
    gameState.players.p1.dice = rollDice(CONSTANTS.INITIAL_DICE_COUNT);
    gameState.players.p2.dice = rollDice(CONSTANTS.INITIAL_DICE_COUNT);
    console.log(">>> 双方骰子已投掷");
    
    setTimeout(() => {
        gameFSM.transitionTo(PHASES.ACTION);
    }, 1000);
});

// 2. 玩家打出卡牌 (快速行动)
globalBus.on('ACTION_PLAY_CARD', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') {
        console.warn("不是你的回合！");
        return;
    }

    const player = gameState.players.p1;
    const cardIndex = player.hand.findIndex(c => c.id === data.cardId);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];

    // 费用检查
    const activeChar = player.characters[player.activeCharId];
    const result = CostValidator.check(player.dice, card.cost, activeChar.element);

    if (result.success) {
        // 扣费
        const newDice = [...player.dice];
        result.paidIndices.sort((a,b) => b-a).forEach(i => newDice.splice(i,1));
        player.dice = newDice;
        
        // 从手牌移除
        const newHand = [...player.hand];
        newHand.splice(cardIndex, 1);
        player.hand = newHand; // 触发UI更新

        console.log(`>>> 打出卡牌: ${card.name} (${card.type})`);

        // 根据卡牌类型执行逻辑
        if (card.type === 'Support') {
            GameMechanics.addSupport(player, card);
        } else if (card.type === 'Weapon' || card.type === 'Artifact') {
            activeChar.equipment.push(card);
            console.log(`>>> 角色装备: ${card.name}`);
        } else {
            // Event
            if (card.id === 'food_lotus') {
                activeChar.statuses.push({ name: '莲花酥', type: 'Buff', value: 1 });
            }
            // ...其他事件卡逻辑
        }

        // 判定：打牌是快速行动
        handleTurnSwitch(false);
    } else {
        alert("费用不足");
    }
});

// 3. 玩家使用技能 (战斗行动)
globalBus.on('ACTION_USE_SKILL', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    const player = gameState.players.p1;
    const opponent = gameState.players.p2;
    const attacker = player.characters[player.activeCharId];
    const target = opponent.characters[opponent.activeCharId];

    // 简化的技能数据 (实际应从 data.skillId 查找)
    const skill = {
        damage: { base: 2, element: attacker.element, type: 'Skill' },
        cost: { count: 3, type: 'Matching' }
    };

    // 费用检查 (略)

    console.log(`>>> ${attacker.name} 使用技能攻击 ${target.name}`);
    const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

    // 应用伤害
    if (ctx.damageValue > 0) {
        target.hp = Math.max(0, target.hp - ctx.damageValue);
        console.log(`>>> 造成 ${ctx.damageValue} 伤害, 剩余HP: ${target.hp}`);

        // 充能 (Rule 2.3.2)
        attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 1);
    }

    // 处理副作用
    ctx.sideEffects.forEach(effect => {
        if (effect.type === 'REMOVE_STATUS') {
            const t = gameState.players.p1.characters[effect.targetId] || gameState.players.p2.characters[effect.targetId];
            if (t) t.statuses = t.statuses.filter(s => s.name !== effect.statusName);
        }
    });

    handleTurnSwitch(true); // 战斗行动 -> 切换
});

// 4. 结束回合
globalBus.on('ACTION_END_ROUND', () => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    console.log(">>> 玩家宣布结束回合");
    gameState.players.p1.hasEndedRound = true;

    // 抢先手逻辑 (Rule 3.2.3)
    if (!gameState.players.p2.hasEndedRound) {
        gameState.players.p1.isFirst = true;
        gameState.players.p2.isFirst = false;
        console.log(">>> 玩家获得下回合先手");
    }

    handleTurnSwitch(true);
});

// 5. 对手 AI
globalBus.on('CMD_OPPONENT_ACT', () => {
    setTimeout(() => {
        if (gameFSM.currentPhase !== PHASES.ACTION) return;
        
        const ai = gameState.players.p2;
        const player = gameState.players.p1;
        
        if (!ai.hasEndedRound) {
             const attacker = ai.characters[ai.activeCharId];
             const target = player.characters[player.activeCharId];

             console.log(`>>> AI ${attacker.name} 攻击!`);
             const skill = { damage: { base: 2, element: attacker.element, type: 'Normal' } };
             const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

             target.hp = Math.max(0, target.hp - ctx.damageValue);

             ai.hasEndedRound = true;
             if (!player.hasEndedRound) {
                 gameState.players.p2.isFirst = true;
                 gameState.players.p1.isFirst = false;
             }

             handleTurnSwitch(true);
        }
    }, 1000);
});

// 6. 结束阶段结算
globalBus.on('CMD_END_PHASE_SETTLEMENT', () => {
    console.log(">>> 结算结束阶段...");

    // 1. 召唤物结算 (略)

    // 2. 状态持续时间 -1 (略)

    // 3. 抽牌 (每人抽2张) (Rule 3.3)
    console.log(">>> 结束阶段：双方各抽2张牌");
    GameMechanics.drawCards(gameState.players.p1, 2);
    GameMechanics.drawCards(gameState.players.p2, 2);

    // 进入下一回合
    setTimeout(() => {
        gameState.roundNumber++;
        gameFSM.transitionTo(PHASES.ROLL);
    }, 2000);
});
