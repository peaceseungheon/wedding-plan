/** 결제 회차(PAYMENT_LABEL) 화면 표기. */
export const PAYMENT_LABEL_TEXT: Readonly<Record<string, string>> = {
  DEPOSIT: "계약금",
  MIDDLE: "중도금",
  FINAL: "잔금",
  ETC: "기타",
};

export function paymentLabelText(label: string): string {
  return PAYMENT_LABEL_TEXT[label] ?? label;
}
