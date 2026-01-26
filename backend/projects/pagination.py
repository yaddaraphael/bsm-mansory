from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Allows client to control page size via ?page_size=.

    Keep max_page_size conservative to protect the API.
    """
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000
