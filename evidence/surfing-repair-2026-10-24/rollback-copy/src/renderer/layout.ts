import type { LayoutPreferences } from '../shared/model';
export const defaultLayout: LayoutPreferences = { left:208, right:282, spacing:16 };
export function fitPanels(layout: LayoutPreferences, width: number, leftOpen=true, rightOpen=true) {
  let left=Math.max(176,Math.min(420,layout.left)),right=Math.max(220,Math.min(460,layout.right));
  const budget=Math.max(396,width-400-(Number(leftOpen)+Number(rightOpen))*6);
  if(leftOpen&&rightOpen&&left+right>budget){right=Math.max(220,budget-left);left=Math.max(176,budget-right);}
  else if(leftOpen&&!rightOpen)left=Math.min(left,Math.max(176,budget));
  else if(rightOpen&&!leftOpen)right=Math.min(right,Math.max(220,budget));
  return {left,right};
}
