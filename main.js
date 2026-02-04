// main.js
// 游戏主控制器：负责逻辑组装和循环控制
import { initView } from './view.js';
import { gameFSM, PHASES } from './fsm.js';
import { globalBus } from './eventBus.js';
import { DamagePipeline } from './damagePipeline.js';
import { rollDice } from './dice.js';
import { gameState } from './model.js';
import { CostValidator } from './costValidator.js';

console.log(">>> 游戏引擎启动中...");
initView();

// 延迟启动
setTimeout(() => {
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
    gameState.players.p1.dice = rollDice(8);
    gameState.players.p2.dice = rollDice(8);
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
        
        // 弃牌
        player.hand = player.hand.filter((_, i) => i !== cardIndex); // 简单处理

        // 执行卡牌效果
        if (card.id === 'food_lotus') {
            // 莲花酥：给当前出战角色添加状态
            activeChar.statuses.push({ name: '莲花酥', type: 'Buff', value: 1 }); // value 用作计数或ID
            console.log(">>> 使用莲花酥：本回合减伤3点");
        } else if (card.id === 'wp_wolf') {
            // 装备：简单的逻辑，加到 equipment 数组
            activeChar.equipment.push(card);
            console.log(">>> 装备狼的末路");
        }
        
        // 判定：打牌通常是快速行动
        handleTurnSwitch(false);
    } else {
        alert("费用不足");
    }
});

// 3. 玩家使用技能 (战斗行动)
// 前端 view.js 需要发送 ACTION_USE_SKILL，带上 skillId
globalBus.on('ACTION_USE_SKILL', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    const player = gameState.players.p1;
    const opponent = gameState.players.p2;
    const attacker = player.characters[player.activeCharId];
    const target = opponent.characters[opponent.activeCharId];

    // 简化的技能数据 (实际应从 data.skillId 查找)
    // 假设是普通攻击 (消耗1杂色1特定) 或 战技 (3特定)
    // 这里为了演示，假设直接通过
    const skill = {
        damage: { base: 3, element: attacker.element, type: 'Skill' },
        cost: { count: 3, type: 'Matching' }
    };

    // 费用检查 (略，假设已过)

    console.log(`>>> ${attacker.name} 使用技能攻击 ${target.name}`);
    const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

    // 应用伤害
    if (ctx.damageValue > 0) {
        target.hp = Math.max(0, target.hp - ctx.damageValue);
        console.log(`>>> 造成 ${ctx.damageValue} 伤害, 剩余HP: ${target.hp}`);
    }

    // 处理副作用 (Switch, Piercing)
    ctx.sideEffects.forEach(effect => {
        if (effect.type === 'REMOVE_STATUS') {
            const t = gameState.players.p1.characters[effect.targetId] || gameState.players.p2.characters[effect.targetId];
            if (t) t.statuses = t.statuses.filter(s => s.name !== effect.statusName);
        }
    });

    // 检查死亡
    if (target.hp === 0) {
        target.isAlive = false;
        console.log(">>> 目标倒下！");
        // 检查游戏胜利 (略)
    }

    handleTurnSwitch(true); // 战斗行动 -> 切换
});

// 4. 结束回合
globalBus.on('ACTION_END_ROUND', () => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    console.log(">>> 玩家宣布结束回合");
    gameState.players.p1.hasEndedRound = true;

    // 抢先手逻辑
    if (!gameState.players.p2.hasEndedRound) {
        gameState.players.p1.isFirst = true;
        gameState.players.p2.isFirst = false;
        console.log(">>> 玩家获得下回合先手");
    }

    handleTurnSwitch(true); // 视为交还控制权
});

// 5. 对手 AI
globalBus.on('CMD_OPPONENT_ACT', () => {
    setTimeout(() => {
        if (gameFSM.currentPhase !== PHASES.ACTION) return;
        
        const ai = gameState.players.p2;
        const player = gameState.players.p1;
        
        // 简单AI：如果有骰子就攻击，否则结束
        // 假设AI无限资源攻击一次然后结束 (为了测试流程)
        if (!ai.hasEndedRound) {
             const attacker = ai.characters[ai.activeCharId];
             const target = player.characters[player.activeCharId];

             console.log(`>>> AI ${attacker.name} 攻击!`);
             const skill = { damage: { base: 2, element: attacker.element, type: 'Normal' } };
             const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

             target.hp = Math.max(0, target.hp - ctx.damageValue);
             console.log(`>>> 玩家受到 ${ctx.damageValue} 伤害`);

             // AI 结束回合
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

    // 3. 抽牌 (每人抽2张)
    // 简单模拟
    console.log(">>> 双方各抽2张牌");

    // 进入下一回合
    setTimeout(() => {
        gameState.roundNumber++;
        gameFSM.transitionTo(PHASES.ROLL);
    }, 2000);
});
