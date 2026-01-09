"""Tests for relationship inference."""
from unittest.mock import AsyncMock

import pytest
from integrations.memorygraph.relationships import infer_relationships


class TestInferRelationships:
    """Tests for infer_relationships function."""

    @pytest.mark.asyncio
    async def test_links_solutions_to_problems(self):
        """Links solutions to problems from same session."""
        problems = [
            {
                "id": "prob_1",
                "title": "Auth failed",
                "content": "JWT token validation failed",
            }
        ]
        solutions = [
            {
                "id": "sol_1",
                "title": "Fixed auth",
                "content": "Added null check for JWT",
            }
        ]

        # Mock client
        client = AsyncMock()
        client.relate = AsyncMock(return_value=True)

        await infer_relationships(problems, solutions, client)

        # Should have called relate to link solution to problem
        assert client.relate.call_count == 1
        call_args = client.relate.call_args[1]
        assert call_args["from_id"] == "sol_1"
        assert call_args["to_id"] == "prob_1"
        assert call_args["relationship_type"] == "SOLVES"

    @pytest.mark.asyncio
    async def test_multiple_solutions_to_multiple_problems(self):
        """Creates all possible solution-problem links."""
        problems = [
            {"id": "prob_1", "content": "Problem 1"},
            {"id": "prob_2", "content": "Problem 2"},
        ]
        solutions = [
            {"id": "sol_1", "content": "Solution 1"},
            {"id": "sol_2", "content": "Solution 2"},
        ]

        client = AsyncMock()
        client.relate = AsyncMock(return_value=True)

        await infer_relationships(problems, solutions, client)

        # 2 solutions × 2 problems = 4 relationships
        assert client.relate.call_count == 4

        # Verify correct pairing by checking actual call arguments
        # Extract all (from_id, to_id) pairs from calls
        call_pairs = set()
        for call in client.relate.call_args_list:
            kwargs = call[1]
            call_pairs.add((kwargs["from_id"], kwargs["to_id"]))
            # All relationships should be SOLVES type
            assert kwargs["relationship_type"] == "SOLVES"

        # Verify all expected pairings exist
        expected_pairs = {
            ("sol_1", "prob_1"),
            ("sol_1", "prob_2"),
            ("sol_2", "prob_1"),
            ("sol_2", "prob_2"),
        }
        assert call_pairs == expected_pairs

    @pytest.mark.asyncio
    async def test_no_relationships_when_no_problems(self):
        """No relationships created when no problems."""
        problems = []
        solutions = [{"id": "sol_1", "content": "Solution 1"}]

        client = AsyncMock()
        client.relate = AsyncMock(return_value=True)

        await infer_relationships(problems, solutions, client)

        assert client.relate.call_count == 0

    @pytest.mark.asyncio
    async def test_no_relationships_when_no_solutions(self):
        """No relationships created when no solutions."""
        problems = [{"id": "prob_1", "content": "Problem 1"}]
        solutions = []

        client = AsyncMock()
        client.relate = AsyncMock(return_value=True)

        await infer_relationships(problems, solutions, client)

        assert client.relate.call_count == 0

    @pytest.mark.asyncio
    async def test_continues_on_relationship_error(self):
        """Continues creating relationships even if one fails."""
        problems = [
            {"id": "prob_1", "content": "Problem 1"},
            {"id": "prob_2", "content": "Problem 2"},
        ]
        solutions = [{"id": "sol_1", "content": "Solution 1"}]

        client = AsyncMock()
        # First call succeeds, second raises exception
        client.relate = AsyncMock(
            side_effect=[True, Exception("Relationship creation failed")]
        )

        # Should not raise exception - continues despite error
        await infer_relationships(problems, solutions, client)

        assert client.relate.call_count == 2
