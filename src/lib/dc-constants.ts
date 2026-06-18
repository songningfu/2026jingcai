/**
 * Dixon-Coles 模型共享常量——推演(deep-model)与 EV(ev-engine)统一引用，
 * 防止两处参数漂移导致"同一场比赛两处概率对不上"。改这里两边同时生效。
 */

/** 低比分相关性修正系数（Dixon-Coles rho，文献常用 −0.1 ~ −0.15） */
export const DC_RHO = -0.13;

/** 单队进球数上限（泊松网格尺寸） */
export const DC_MAX_GOALS = 8;
