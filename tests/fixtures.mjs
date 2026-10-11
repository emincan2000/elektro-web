// Deterministic input files the help examples refer to (fft scope.csv / data.csv / adc.txt).
export function fixtures() {
  const n = 256, fs = 1000;
  const rows = [], rows3 = [], adc = [];
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const v = Math.sin(2 * Math.PI * 50 * t) + 0.3 * Math.sin(2 * Math.PI * 120 * t);
    rows.push(`${t.toFixed(6)},${v.toFixed(6)}`);
    rows3.push(`${t.toFixed(6)},0,${(0.5 * v).toFixed(6)}`);
    adc.push(String(Math.round(2048 + 1000 * v)));
  }
  return {
    "scope.csv": "time,ch1\n" + rows.join("\n") + "\n",
    "data.csv": "t,a,b\n" + rows3.join("\n") + "\n",
    "adc.txt": adc.join("\n") + "\n",
  };
}
