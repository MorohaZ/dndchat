declare module 'jstat' {
  export const jStat: {
    chisquare: {
      pdf(x: number, df: number): number;
      cdf(x: number, df: number): number;
      inv(p: number, df: number): number;
    };
    [key: string]: any;
  };
}
