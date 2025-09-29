import { NextRequest, NextResponse } from 'next/server';
import connectDB from '../../../../../lib/mongodb';
import Request from '../../../../../models/Request';
import User from '../../../../../models/User';
import { getCurrentUser } from '../../../../../lib/auth';
import { RequestStatus, ActionType, UserRole } from '../../../../../lib/types';
import { approvalEngine } from '../../../../../lib/approval-engine';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const { action, notes, budgetAvailable, forwardedMessage, attachments, target } = await request.json();
    
    // Validate action
    if (!['approve', 'reject', 'clarify', 'forward'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Find the request
    const requestRecord = await Request.findById(params.id);
    if (!requestRecord) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Check if user is authorized to approve this request
    const requiredApprovers = approvalEngine.getRequiredApprover(requestRecord.status);
    if (!requiredApprovers.includes(user.role as UserRole)) {
      return NextResponse.json({ error: 'Not authorized to approve this request' }, { status: 403 });
    }

    // Store previous status for history tracking
    const previousStatus = requestRecord.status;

    // Determine next status based on action
    let nextStatus = requestRecord.status;
    let actionType = ActionType.APPROVE;
    
    switch (action) {
      case 'approve':
        // Get next status based on approval rules
        nextStatus = approvalEngine.getNextStatus(
          requestRecord.status, 
          ActionType.APPROVE, 
          user.role as UserRole,
          { budgetAvailable }
        ) || requestRecord.status;
        actionType = ActionType.APPROVE;
        break;
        
      case 'reject':
        nextStatus = RequestStatus.REJECTED;
        actionType = ActionType.REJECT;
        break;
        
      case 'clarify':
        // For Institution Manager clarification, determine which step to clarify
        if (user.role === UserRole.INSTITUTION_MANAGER && target) {
          // Use approval engine to determine next status based on target
          nextStatus = approvalEngine.getNextStatus(
            requestRecord.status,
            ActionType.CLARIFY,
            user.role as UserRole,
            { clarificationType: target }
          ) || requestRecord.status;
        } else if (user.role === UserRole.DEAN && target) {
          // Dean clarification with department users
          nextStatus = approvalEngine.getNextStatus(
            requestRecord.status,
            ActionType.CLARIFY,
            user.role as UserRole,
            { clarificationType: 'department' }
          ) || requestRecord.status;
        } else if (['mma', 'hr', 'audit', 'it'].includes(user.role) && requestRecord.status === 'department_clarification') {
          // Department users responding to clarification - return to Dean
          nextStatus = approvalEngine.getNextStatus(
            requestRecord.status,
            ActionType.APPROVE,  // Use APPROVE action to trigger the transition back to Dean
            user.role as UserRole,
            { }
          ) || RequestStatus.DEAN_REVIEW; // Fallback to DEAN_REVIEW
        } else if (user.role === UserRole.SOP_VERIFIER && requestRecord.status === 'sop_clarification') {
          // SOP Verifier responding to clarification - return to Institution Manager
          nextStatus = RequestStatus.MANAGER_REVIEW;
        } else if (user.role === UserRole.ACCOUNTANT && requestRecord.status === 'budget_clarification') {
          // Accountant responding to clarification - return to Institution Manager
          nextStatus = RequestStatus.MANAGER_REVIEW;
        } else {
          nextStatus = RequestStatus.CLARIFICATION_REQUIRED;
        }
        actionType = ActionType.CLARIFY;
        break;
        
      case 'forward':
        // Use approval engine to determine next status for forward action
        nextStatus = approvalEngine.getNextStatus(
          requestRecord.status,
          ActionType.FORWARD,
          user.role as UserRole,
          { }
        ) || requestRecord.status;
        actionType = ActionType.FORWARD;
        break;
    }

    // Prepare history entry
    const historyEntry: any = {
  action: actionType,
  actor: user.id,
  previousStatus: previousStatus,
  newStatus: nextStatus, // Always use the actual nextStatus
  timestamp: new Date(),
  ...(action === 'clarify' && target ? { target } : {}),
    };

    // Add appropriate fields based on action type
    if (action === 'forward') {
      historyEntry.forwardedMessage = forwardedMessage || notes || '';
      if (attachments && attachments.length > 0) {
        historyEntry.attachments = attachments;
      }
    } else {
      if (notes) {
        historyEntry.notes = notes;
      }
      if (budgetAvailable !== undefined) {
        historyEntry.budgetAvailable = budgetAvailable;
      }
    }

    // Update request with new status and history
    const updateData: any = {
      $push: {
        history: historyEntry
      }
    };

    // Update status if it actually changed
    if (nextStatus !== previousStatus) {
      updateData.$set = { status: nextStatus };
    }

    // Handle attachments at the request level for approve/reject actions
    if (action !== 'forward' && attachments && attachments.length > 0) {
      if (!updateData.$set) {
        updateData.$set = {};
      }
      updateData.$set.attachments = [...requestRecord.attachments, ...attachments];
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      params.id,
      updateData,
      { new: true }
    ).populate('requester', 'name email empId')
      .populate('history.actor', 'name email empId');

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Approve request error:', error);
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 });
  }
}