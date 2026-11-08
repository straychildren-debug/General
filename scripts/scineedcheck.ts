// Проверка правила «показано 10 — хватит и 9 500»: уровень открывается, если учёных не меньше показанного минус 500.
import { sciNeed } from '../src/core/balance';
const ptsPer = 0.1;
for (const needSci of [9400, 9600, 10200, 10490, 10510, 300]) {
  const left = needSci * ptsPer;
  const nd = sciNeed(left, ptsPer);
  console.log(`нужно точно ${needSci} → показано ${nd.shown / 1000}, хватит от ${nd.req}`);
}
