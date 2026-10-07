export type RiskDecision = 'ALLOW' | 'STEP_UP' | 'DENY';

export interface IRiskAssessmentResult {
  assessmentId: string;
  tenantId: string;
  userId: string;
  decision: RiskDecision;
  riskScore: number; // 0 to 100
  reasons?: string[];
  evaluatedAt: Date;
}

export interface IRiskEngineAdapter {
  /**
   * Adapter contract representing integration with external Spring Boot Risk Engine.
   * Node.js Passkey Service does NOT duplicate risk scoring or override risk engine decisions.
   */
  getAssessmentResult(assessmentId: string): Promise<IRiskAssessmentResult | null>;
}

export class SpringBootRiskEngineAdapter implements IRiskEngineAdapter {
  /**
   * Interface placeholder adapter connecting to Spring Boot Risk Engine REST API.
   */
  public async getAssessmentResult(assessmentId: string): Promise<IRiskAssessmentResult | null> {
    // In production integration, this calls Spring Boot REST endpoint `GET /api/v1/risk/assessments/:assessmentId`
    // Development adapter fallback evaluating mock decisions for test suites:
    const isDeny = assessmentId.toLowerCase().includes('deny');
    const isAllow = assessmentId.toLowerCase().includes('allow');

    return {
      assessmentId,
      tenantId: 'tenant_dev_123',
      userId: 'usr_dev_1001',
      decision: isDeny ? 'DENY' : isAllow ? 'ALLOW' : 'STEP_UP',
      riskScore: isDeny ? 95 : isAllow ? 10 : 75,
      reasons: isDeny ? ['MALICIOUS_IP'] : isAllow ? [] : ['HIGH_RISK_IP', 'UNFAMILIAR_DEVICE'],
      evaluatedAt: new Date(),
    };
  }
}
