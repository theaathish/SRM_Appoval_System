import { RequestStatus, UserRole, ActionType } from './types';

export interface ApprovalRule {
  from: RequestStatus;
  to: RequestStatus;
  requiredRole: UserRole;
  condition?: (context: any) => boolean;
}

export class ApprovalEngine {
  private rules: ApprovalRule[] = [
    // Request Raiser (HOD/Faculty) → Institution Manager(s)
    { from: RequestStatus.SUBMITTED, to: RequestStatus.MANAGER_REVIEW, requiredRole: UserRole.INSTITUTION_MANAGER },

    // Institution Manager(s) → SOP Verification (Material Check)
    { from: RequestStatus.MANAGER_REVIEW, to: RequestStatus.SOP_VERIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },
    
    // Institution Manager can also directly approve from MANAGER_REVIEW to INSTITUTION_VERIFIED
    { from: RequestStatus.MANAGER_REVIEW, to: RequestStatus.INSTITUTION_VERIFIED, requiredRole: UserRole.INSTITUTION_MANAGER },
    
    // Institution Manager can also forward directly from MANAGER_REVIEW to VP_APPROVAL
    { from: RequestStatus.MANAGER_REVIEW, to: RequestStatus.VP_APPROVAL, requiredRole: UserRole.INSTITUTION_MANAGER },

    // Institution Manager can request SOP clarification
    { from: RequestStatus.MANAGER_REVIEW, to: RequestStatus.SOP_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.SOP_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },
    { from: RequestStatus.BUDGET_CHECK, to: RequestStatus.SOP_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },

    // Institution Manager can request Budget clarification  
    { from: RequestStatus.MANAGER_REVIEW, to: RequestStatus.BUDGET_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },
    { from: RequestStatus.BUDGET_CHECK, to: RequestStatus.BUDGET_CLARIFICATION, requiredRole: UserRole.INSTITUTION_MANAGER },

    // Dean can request Department clarification from the 4 department users
    { from: RequestStatus.DEAN_REVIEW, to: RequestStatus.DEPARTMENT_CLARIFICATION, requiredRole: UserRole.DEAN },

    // SOP Verifier can return from SOP clarification to Institution Manager
    { from: RequestStatus.SOP_CLARIFICATION, to: RequestStatus.MANAGER_REVIEW, requiredRole: UserRole.SOP_VERIFIER },

    // Accountant can return from Budget clarification to Institution Manager
    { from: RequestStatus.BUDGET_CLARIFICATION, to: RequestStatus.MANAGER_REVIEW, requiredRole: UserRole.ACCOUNTANT },

    // Department users can return from Department clarification to Dean Review
    { from: RequestStatus.DEPARTMENT_CLARIFICATION, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.MMA },
    { from: RequestStatus.DEPARTMENT_CLARIFICATION, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.HR },
    { from: RequestStatus.DEPARTMENT_CLARIFICATION, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.AUDIT },
    { from: RequestStatus.DEPARTMENT_CLARIFICATION, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.IT },

    // SOP Verification → Accountant Verify (Budget Check) - Any department can approve
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CHECK, requiredRole: UserRole.MMA },
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CHECK, requiredRole: UserRole.HR },
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CHECK, requiredRole: UserRole.AUDIT },
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CHECK, requiredRole: UserRole.IT },

    // SOP Verifier can also directly approve SOP verification
    { from: RequestStatus.SOP_VERIFICATION, to: RequestStatus.BUDGET_CHECK, requiredRole: UserRole.SOP_VERIFIER },

    // Accountant Verify → Institution Verified
    { from: RequestStatus.BUDGET_CHECK, to: RequestStatus.INSTITUTION_VERIFIED, requiredRole: UserRole.ACCOUNTANT },

    // Institution Verified → VP Approval (Budget Available) OR Dean Review (Budget NOT Available)
    { from: RequestStatus.INSTITUTION_VERIFIED, to: RequestStatus.VP_APPROVAL, requiredRole: UserRole.INSTITUTION_MANAGER, condition: (ctx) => ctx.budgetAvailable === true },
    { from: RequestStatus.INSTITUTION_VERIFIED, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.INSTITUTION_MANAGER, condition: (ctx) => ctx.budgetAvailable === false },
    
    // Institution Manager can also forward directly to VP (regardless of budget status)
    { from: RequestStatus.INSTITUTION_VERIFIED, to: RequestStatus.VP_APPROVAL, requiredRole: UserRole.INSTITUTION_MANAGER },

    // VP Approval → Head of Institution
    { from: RequestStatus.VP_APPROVAL, to: RequestStatus.HOI_APPROVAL, requiredRole: UserRole.VP },

    // Head of Institution → Dean Review
    { from: RequestStatus.HOI_APPROVAL, to: RequestStatus.DEAN_REVIEW, requiredRole: UserRole.HEAD_OF_INSTITUTION },

    // Dean Review → Chief Director (simplified flow)
    { from: RequestStatus.DEAN_REVIEW, to: RequestStatus.CHIEF_DIRECTOR_APPROVAL, requiredRole: UserRole.DEAN },

    // Chief Director → Chairman
    { from: RequestStatus.CHIEF_DIRECTOR_APPROVAL, to: RequestStatus.CHAIRMAN_APPROVAL, requiredRole: UserRole.CHIEF_DIRECTOR },

    // Chairman → Final Approval
    { from: RequestStatus.CHAIRMAN_APPROVAL, to: RequestStatus.APPROVED, requiredRole: UserRole.CHAIRMAN },
  ];

  getNextStatus(currentStatus: RequestStatus, action: ActionType, userRole: UserRole, context: any = {}): RequestStatus | null {
    if (action === ActionType.REJECT) {
      return RequestStatus.REJECTED;
    }

    if (action === ActionType.CLARIFY) {
      // Only Institution Manager can request SOP and Accountant clarifications
      if (userRole === UserRole.INSTITUTION_MANAGER) {
        if (context.clarificationType === 'sop') {
          return RequestStatus.SOP_CLARIFICATION;
        } else if (context.clarificationType === 'accountant') {
          return RequestStatus.BUDGET_CLARIFICATION;
        }
      }
      
      // Dean can request Department clarification from MMA, HR, Audit, IT
      if (userRole === UserRole.DEAN) {
        if (context.clarificationType === 'department') {
          return RequestStatus.DEPARTMENT_CLARIFICATION;
        }
      }
      
      // Default clarification for other roles (if any)
      return RequestStatus.CLARIFICATION_REQUIRED;
    }
    
    // For forward action, determine the next appropriate status
    if (action === ActionType.FORWARD) {
      // Institution Manager can forward from MANAGER_REVIEW or INSTITUTION_VERIFIED to VP
      if ((currentStatus === RequestStatus.MANAGER_REVIEW || currentStatus === RequestStatus.INSTITUTION_VERIFIED) && userRole === UserRole.INSTITUTION_MANAGER) {
        return RequestStatus.VP_APPROVAL; // Forward to VP
      }
      
      // VP forwards to HOI
      if (currentStatus === RequestStatus.VP_APPROVAL && userRole === UserRole.VP) {
        return RequestStatus.HOI_APPROVAL;
      }
      
      // HOI forwards to Dean
      if (currentStatus === RequestStatus.HOI_APPROVAL && userRole === UserRole.HEAD_OF_INSTITUTION) {
        return RequestStatus.DEAN_REVIEW;
      }
      
      // Dean forwards from DEAN_REVIEW directly to CHIEF_DIRECTOR_APPROVAL (simplified flow)
      if (currentStatus === RequestStatus.DEAN_REVIEW && userRole === UserRole.DEAN) {
        return RequestStatus.CHIEF_DIRECTOR_APPROVAL;
      }
      
      // Chief Director forwards to Chairman
      if (currentStatus === RequestStatus.CHIEF_DIRECTOR_APPROVAL && userRole === UserRole.CHIEF_DIRECTOR) {
        return RequestStatus.CHAIRMAN_APPROVAL;
      }
      
      // For other cases, status remains the same
      return currentStatus;
    }

    // Special handling for Institution Manager at INSTITUTION_VERIFIED stage
    if (currentStatus === RequestStatus.INSTITUTION_VERIFIED && userRole === UserRole.INSTITUTION_MANAGER) {
      if (context.budgetAvailable === true) {
        return RequestStatus.VP_APPROVAL;
      } else if (context.budgetAvailable === false) {
        return RequestStatus.DEAN_REVIEW;
      }
    }

    const applicableRules = this.rules.filter(rule => 
      rule.from === currentStatus && rule.requiredRole === userRole
    );

    for (const rule of applicableRules) {
      if (!rule.condition || rule.condition(context)) {
        return rule.to;
      }
    }

    return null;
  }

  getRequiredApprover(status: RequestStatus): UserRole[] {
    const approvers: Record<RequestStatus, UserRole[]> = {
      [RequestStatus.SUBMITTED]: [UserRole.INSTITUTION_MANAGER],
      [RequestStatus.MANAGER_REVIEW]: [UserRole.INSTITUTION_MANAGER],
      [RequestStatus.SOP_VERIFICATION]: [UserRole.MMA, UserRole.HR, UserRole.AUDIT, UserRole.IT, UserRole.SOP_VERIFIER],
      [RequestStatus.BUDGET_CHECK]: [UserRole.ACCOUNTANT],
      [RequestStatus.INSTITUTION_VERIFIED]: [UserRole.INSTITUTION_MANAGER],
      [RequestStatus.VP_APPROVAL]: [UserRole.VP],
      [RequestStatus.HOI_APPROVAL]: [UserRole.HEAD_OF_INSTITUTION],
      [RequestStatus.DEAN_REVIEW]: [UserRole.DEAN],
      [RequestStatus.DEPARTMENT_CHECKS]: [], // Removed from workflow
      [RequestStatus.DEAN_VERIFICATION]: [], // Removed from workflow
      [RequestStatus.CHIEF_DIRECTOR_APPROVAL]: [UserRole.CHIEF_DIRECTOR],
      [RequestStatus.CHAIRMAN_APPROVAL]: [UserRole.CHAIRMAN],
      [RequestStatus.APPROVED]: [],
      [RequestStatus.REJECTED]: [],
      [RequestStatus.CLARIFICATION_REQUIRED]: [UserRole.REQUESTER],
      [RequestStatus.SOP_CLARIFICATION]: [UserRole.SOP_VERIFIER, UserRole.MMA, UserRole.HR, UserRole.AUDIT, UserRole.IT],
      [RequestStatus.BUDGET_CLARIFICATION]: [UserRole.ACCOUNTANT],
      [RequestStatus.DEPARTMENT_CLARIFICATION]: [UserRole.MMA, UserRole.HR, UserRole.AUDIT, UserRole.IT],
    };

    return approvers[status] || [];
  }

  getStatusProgress(status: RequestStatus): { step: number; total: number } {
    const statusOrder = [
      RequestStatus.SUBMITTED,
      RequestStatus.MANAGER_REVIEW,
      RequestStatus.SOP_VERIFICATION,
      RequestStatus.BUDGET_CHECK,
      RequestStatus.INSTITUTION_VERIFIED,
      RequestStatus.VP_APPROVAL,
      RequestStatus.HOI_APPROVAL,
      RequestStatus.DEAN_REVIEW,
      RequestStatus.CHIEF_DIRECTOR_APPROVAL,
      RequestStatus.CHAIRMAN_APPROVAL,
      RequestStatus.APPROVED,
    ];

    const step = statusOrder.indexOf(status) + 1;
    return { step: Math.max(step, 1), total: statusOrder.length };
  }
}

export const approvalEngine = new ApprovalEngine();