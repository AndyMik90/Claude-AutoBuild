"""
Service Matching and Suggestion
=================================

Suggests relevant services based on task description.
"""


class ServiceMatcher:
    """Matches services to tasks based on keywords and metadata."""

    def __init__(self, project_index: dict):
        self.project_index = project_index

    def suggest_services(self, task: str) -> list[str]:
        """
        Suggest which services are relevant for a task.

        Args:
            task: Task description string

        Returns:
            List of service names most relevant to the task
        """
        task_lower = task.lower()
        services = self.project_index.get("services", {})
        suggested = []

        for service_name, service_info in services.items():
            score = 0
            name_lower = service_name.lower()

            # Check if service name is mentioned
            if name_lower in task_lower:
                score += 10

            # Check service type relevance
            service_type = service_info.get("type", "")
            if service_type == "backend" and any(
                kw in task_lower
                for kw in ["api", "endpoint", "route", "database", "model"]
            ):
                score += 5
            if service_type == "frontend" and any(
                kw in task_lower for kw in ["ui", "component", "page", "button", "form"]
            ):
                score += 5
            if service_type == "worker" and any(
                kw in task_lower
                for kw in ["job", "task", "queue", "background", "async"]
            ):
                score += 5
            if service_type == "scraper" and any(
                kw in task_lower for kw in ["scrape", "crawl", "fetch", "parse"]
            ):
                score += 5

            # Check framework relevance
            framework = service_info.get("framework", "").lower()
            if framework and framework in task_lower:
                score += 3

            if score > 0:
                suggested.append((service_name, score))

        # Sort by score and return top services
        suggested.sort(key=lambda x: x[1], reverse=True)

        if suggested:
            return [s[0] for s in suggested[:3]]  # Top 3

        # Default: return first backend and first frontend
        default = []
        for name, info in services.items():
            if info.get("type") == "backend" and "backend" not in [s for s in default]:
                default.append(name)
            elif info.get("type") == "frontend" and "frontend" not in [
                s for s in default
            ]:
                default.append(name)
        return default[:2] if default else list(services.keys())[:2]
