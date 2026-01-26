"""
Python 3.14 compatibility patch for Django 5.2.10
This fixes the 'super' object has no attribute 'dicts' error in Django admin.

The issue is that Python 3.14 changed how super() objects work, and Django's
Context.__copy__ method tries to access attributes that don't exist on super()
objects in Python 3.14.
"""
import sys

# Only apply patch for Python 3.14+
if sys.version_info >= (3, 14):
    try:
        from django.template import context as context_module
        from copy import copy as copy_func
        
        # Check if RequestContext exists (it does in Django)
        RequestContext = getattr(context_module, 'RequestContext', None)
        
        # Monkey-patch the copy function to handle Django Context objects specially
        _original_copy = copy_func
        
        def _patched_copy(x):
            """Patched copy function that handles Django Context objects on Python 3.14."""
            # Check if it's a Django Context object
            if isinstance(x, context_module.Context):
                # Handle RequestContext specially (requires request parameter)
                if RequestContext and isinstance(x, RequestContext):
                    # Get the request from the original context
                    request = getattr(x, 'request', None)
                    if request is not None:
                        # Create new RequestContext with the request
                        duplicate = RequestContext(request)
                    else:
                        # Fallback: create regular Context if request is missing
                        duplicate = context_module.Context()
                else:
                    # Regular Context - can be created without parameters
                    duplicate = context_module.Context()
                
                # Copy dicts if it exists
                if hasattr(x, 'dicts'):
                    duplicate.dicts = x.dicts[:]
                
                # Copy other instance attributes
                if hasattr(x, '__dict__'):
                    for key, value in x.__dict__.items():
                        if key not in ('dicts', 'request'):  # Skip dicts (already handled) and request (already set)
                            try:
                                setattr(duplicate, key, value)
                            except (AttributeError, TypeError):
                                pass
                return duplicate
            # For other objects, use original copy
            return _original_copy(x)
        
        # Replace copy in the copy module
        import copy
        copy.copy = _patched_copy
        
        # Also patch Context.__copy__ directly as a fallback
        def _context_copy(self):
            """Patched Context.__copy__ method."""
            # Handle RequestContext specially
            if RequestContext and isinstance(self, RequestContext):
                request = getattr(self, 'request', None)
                if request is not None:
                    duplicate = RequestContext(request)
                else:
                    duplicate = context_module.Context()
            else:
                # Regular Context
                duplicate = context_module.Context()
            
            # Copy dicts if it exists
            if hasattr(self, 'dicts'):
                duplicate.dicts = self.dicts[:]
            
            # Copy other instance attributes
            if hasattr(self, '__dict__'):
                for key, value in self.__dict__.items():
                    if key not in ('dicts', 'request'):
                        try:
                            setattr(duplicate, key, value)
                        except (AttributeError, TypeError):
                            pass
            return duplicate
        
        context_module.Context.__copy__ = _context_copy
        
    except ImportError:
        # Django not installed yet, skip patch
        pass
