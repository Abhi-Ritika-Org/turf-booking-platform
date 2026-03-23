def paginate_data(data, offset=0, limit=10):
    """Paginate the data based on offset and limit."""
    if not isinstance(data, list):
        raise ValueError("Data must be a list for pagination.")
    
    total_items = len(data)
    if offset < 0 or limit <= 0:
        raise ValueError("Offset must be non-negative and limit must be positive.")
    
    paginated_data = data[(offset*limit) : (offset*limit + limit)]
    return paginated_data