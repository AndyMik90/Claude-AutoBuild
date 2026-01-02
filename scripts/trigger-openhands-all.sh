#!/bin/bash
# Trigger OpenHands on all open issues

REPO="joelfuller2016/Auto-Claude"
BATCH_SIZE=10
DELAY=2

echo "Getting all open issues..."
ISSUES=$(gh issue list --repo $REPO --state open --limit 100 --json number --jq '.[].number')

ISSUE_ARRAY=($ISSUES)
TOTAL=${#ISSUE_ARRAY[@]}

echo "Found $TOTAL open issues"
echo "Triggering OpenHands on all issues in batches of $BATCH_SIZE..."
echo ""

COUNT=0
for ISSUE_NUM in "${ISSUE_ARRAY[@]}"; do
    COUNT=$((COUNT + 1))
    echo "[$COUNT/$TOTAL] Triggering OpenHands on issue #$ISSUE_NUM"
    
    gh issue comment $ISSUE_NUM --repo $REPO --body "@openhands-agent Please implement this issue with comprehensive tests and documentation." 2>&1 | grep -v "^$" || true
    
    # Add delay every BATCH_SIZE issues
    if [ $((COUNT % BATCH_SIZE)) -eq 0 ]; then
        echo "  Batch complete. Waiting ${DELAY}s before next batch..."
        sleep $DELAY
    fi
done

echo ""
echo "✅ Triggered OpenHands on all $TOTAL issues"
echo ""
echo "Monitor progress:"
echo "  Actions: https://github.com/$REPO/actions?query=workflow%3A%22OpenHands+Fix+Issues%22"
