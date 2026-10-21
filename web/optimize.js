/* ============================================================
 * 皮肤优化器：坐标上升 + 随机重启
 * - 皮肤1（索引0）固定不参与
 * - 皮肤2/3 从用户勾选的同一候选池中选（允许同组互斥皮肤重复）
 * ============================================================ */
class Optimizer {
    constructor() {
        this.cancelled = false;
        this.step = 0;
    }

    stop() {
        this.cancelled = true;
    }

    async run(opts) {
        const {
            seqParts, roleValues, currentSkins, candidates,
            objectiveFn, maxRounds, timeoutMs, onProgress
        } = opts;

        this.cancelled = false;
        this.step = 0;
        const startTime = Date.now();
        const seq = seqParts.join('，');
        const N = seqParts.length;

        let bestSkins = currentSkins.map(a => a.slice());
        let bestResult = PkCal.evaluate(seq, roleValues, bestSkins.map(s => s.join(',')));
        if (!bestResult.valid) {
            return { ok: false, reason: "初始配置无效: " + (bestResult.reason || "") };
        }
        let bestScore = objectiveFn(bestResult);
        const initialScore = bestScore;

        const totalSteps = N * 2 * candidates.length * maxRounds;

        let timedOut = false;
        let improvedOverall = true;
        let round;

        outer:
        for (round = 0; round < maxRounds && improvedOverall; round++) {
            improvedOverall = false;
            for (let ri = 0; ri < N; ri++) {
                // 皮肤1 固定，si 从 1 开始
                for (let si = 1; si < 3; si++) {
                    const currentSkin = bestSkins[ri][si];
                    let localBest = null, localBestScore = bestScore, localBestResult = null;

                    for (const cand of candidates) {
                        if (this.cancelled) break outer;
                        if (Date.now() - startTime > timeoutMs) {
                            timedOut = true;
                            break outer;
                        }
                        if (cand === currentSkin) continue;
                        this.step++;

                        const trial = bestSkins.map(a => a.slice());
                        trial[ri][si] = cand;
                        const trialResult = PkCal.evaluate(
                            seq, roleValues, trial.map(s => s.join(','))
                        );
                        if (!trialResult.valid) continue;

                        const trialScore = objectiveFn(trialResult);
                        if (trialScore > localBestScore + 1e-9) {
                            localBestScore = trialScore;
                            localBest = cand;
                            localBestResult = trialResult;
                        }

                        if (this.step % 200 === 0) {
                            if (onProgress) onProgress({
                                step: this.step, totalSteps, round, bestScore, bestResult
                            });
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    if (localBest !== null) {
                        bestSkins[ri][si] = localBest;
                        bestScore = localBestScore;
                        bestResult = localBestResult;
                        improvedOverall = true;

                        if (onProgress) onProgress({
                            step: this.step, totalSteps, round, bestScore, bestResult,
                            pendingImprovement: {
                                roleIndex: ri, roleName: seqParts[ri],
                                slotIndex: si,
                                from: currentSkin || "空点化",
                                to: localBest
                            }
                        });
                    }
                }
            }
        }

        return {
            ok: true, config: bestSkins, result: bestResult, score: bestScore,
            initialScore, elapsed: Date.now() - startTime,
            timedOut, cancelled: this.cancelled, rounds: round
        };
    }
}

const optimizer = new Optimizer();